import React, { useState } from 'react';
import algosdk from 'algosdk';
import { WalletProvider, WalletId, WalletManager, useWallet } from '@txnlab/use-wallet-react';

// Utility to convert base64 to Uint8Array (browser-safe, no Buffer)
const base64ToUint8Array = (base64) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// Decode ARC-4 DynamicArray[Address] from global state
const decodeDynamicAddressArray = (byteValue) => {
  const bytes = new Uint8Array(byteValue);
  const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = dataView.getUint16(0, false); // First 2 bytes = length
  const addresses = [];
  for (let i = 0; i < length; i++) {
    const offset = 2 + i * 32; // 2 bytes length + 32 bytes per address
    const addressBytes = bytes.slice(offset, offset + 32);
    addresses.push(algosdk.encodeAddress(addressBytes));
  }
  return addresses;
};

// Convert Uint8Array key to string
const uint8ArrayToString = (uint8Array) => {
  return String.fromCharCode.apply(null, uint8Array);
};

// Define wallet configurations
const walletConfigs = {
  [WalletId.KIBISIS]: {
    id: WalletId.KIBISIS,
  },
  [WalletId.LUTE]: {
    id: WalletId.LUTE,
    options: {
      siteName: 'Voi Lottery Test',
    },
  },
};

// Initialize WalletManager dynamically based on selected wallet
const initializeWalletManager = (walletId) => {
  return new WalletManager({
    wallets: [walletConfigs[walletId]], // Only include the selected wallet
    network: 'voimain',
    algod: {
      server: 'https://mainnet-api.voi.nodely.dev',
      port: '',
      token: '',
    },
  });
};

function App() {
  const [selectedWallet, setSelectedWallet] = useState(null);

  // Render wallet selection UI if no wallet is selected
  if (!selectedWallet) {
    return (
      <div>
        <h2>Select a Wallet</h2>
        <button onClick={() => setSelectedWallet(WalletId.KIBISIS)}>
          Connect with Kibisis
        </button>
        <button onClick={() => setSelectedWallet(WalletId.LUTE)}>
          Connect with Lute
        </button>
      </div>
    );
  }

  // Initialize WalletManager with the selected wallet
  const walletManager = initializeWalletManager(selectedWallet);

  return (
    <WalletProvider manager={walletManager}>
      <LotteryComponent onChangeWallet={() => setSelectedWallet(null)} />
    </WalletProvider>
  );
}

function LotteryComponent({ onChangeWallet }) {
  const { activeAddress, signTransactions, wallets } = useWallet();
  const [balance, setBalance] = useState(0);
  const [players, setPlayers] = useState([]);
  const [lastWinner, setLastWinner] = useState('');

  const algodClient = new algosdk.Algodv2('', 'https://mainnet-api.voi.nodely.dev', '');
  const indexerClient = new algosdk.Indexer('', 'https://mainnet-idx.voi.nodely.dev', '');
  const appId = 8432765;
  const appAddress = 'BGE5KDRZ3G5KGADWLIVKNIVY5IEXXGN7GES2ZXEVJM2WTJ7CCMGAD3RGGU';
  const managerAddress = 'AM2O6LNEYJKPG7CMU6OIYW36GOFN7GKAH5HPSOSCLS42F7FCDVSMI4PFZY';

  // Method selectors
  const pickWinnerSelector = new Uint8Array([0x93, 0xf2, 0x24, 0xc7]); // pick_winner: 93f224c7
  const enterSelector = base64ToUint8Array('kXKZLg=='); // enter: explicitly "kXKZLg=="

  const fetchState = async () => {
    if (!activeAddress) {
      console.log('fetchState skipped: no activeAddress');
      return;
    }
    try {
      const accountInfo = await indexerClient.lookupAccountByID(appAddress).do();
      setBalance(Number(accountInfo.account.amount) / 1_000_000);

      const appResponse = await indexerClient.searchForApplications().index(appId).do();
      console.log('App search response:', appResponse);
      const globalState = appResponse.applications[0].params.globalState;
      console.log('globalState', globalState);

      const playersState = globalState.find(state => uint8ArrayToString(state.key) === 'players');
      if (playersState && playersState.value.type === 1) {
        const playersArray = decodeDynamicAddressArray(playersState.value.bytes);
        setPlayers(playersArray);
      } else {
        setPlayers([]);
      }

      const lastWinnerState = globalState.find(state => uint8ArrayToString(state.key) === 'last_winner');
      if (lastWinnerState && lastWinnerState.value.type === 1) {
        setLastWinner(algosdk.encodeAddress(lastWinnerState.value.bytes));
      }
    } catch (error) {
      console.error('Fetch state error:', error);
    }
  };

  const pickWinner = async () => {
    console.log('Active address:', activeAddress);
    console.log('Manager address:', managerAddress);
    if (!activeAddress || activeAddress !== managerAddress) {
      alert('Only manager can pick winner');
      return;
    }
    if (balance < 0.5) {
      alert('Insufficient contract balance to pick winner');
      return;
    }
    try {
      // Ensure players list is fresh
      await fetchState();
      console.log('Current players:', players);
      if (players.length < 2) {
        alert('At least 2 players are required to pick a winner');
        return;
      }
  
      const atc = new algosdk.AtomicTransactionComposer();
      const sp = await algodClient.getTransactionParams().do();
  
      const txn = algosdk.makeApplicationNoOpTxnFromObject({
        sender: activeAddress,
        suggestedParams: sp,
        appIndex: appId,
        appArgs: [pickWinnerSelector],
        accounts: players, // Include all players as potential winners
      });
  
      atc.addTransaction({
        txn: txn,
        signer: async (unsignedTxns) => {
          const encodedTxns = unsignedTxns.map(txn => algosdk.encodeUnsignedTransaction(txn));
          return await signTransactions(encodedTxns);
        },
      });
  
      console.log('Executing pickWinner transaction...');
      const result = await atc.execute(algodClient, 4);
      console.log('Transaction confirmed:', result);
  
      const txId = result.txIDs[0];
      const confirmedTxn = await algosdk.waitForConfirmation(algodClient, txId, 4);
      if (confirmedTxn.logs && confirmedTxn.logs.length > 0) {
        const lastLog = confirmedTxn.logs[confirmedTxn.logs.length - 1];
        const logBytes = new Uint8Array(lastLog);
        console.log('Raw log bytes:', Array.from(logBytes));
  
        if (logBytes.length >= 36 && logBytes[0] === 0x15 && logBytes[1] === 0x1f && logBytes[2] === 0x7c && logBytes[3] === 0x75) {
          const addressBytes = logBytes.slice(4, 36);
          const winner = algosdk.encodeAddress(addressBytes);
          console.log('Pick Winner return value:', winner);
  
          // Optional: Validate winner account
          const isWinnerValid = await checkWinnerAccount(winner);
          if (!isWinnerValid) {
            alert('Selected winner account is not valid or has insufficient balance');
            return;
          }
  
          setLastWinner(winner);
          setPlayers([]);
        } else {
          console.warn('Log does not match expected ABI return format:', Array.from(logBytes));
        }
      } else {
        console.warn('No logs found in transaction');
      }
  
      await fetchState();
    } catch (error) {
      console.error('Pick winner error:', error);
      if (error.message.includes('logic eval error')) {
        console.log('Contract logic failed; check winner address and contract balance');
      }
      await fetchState(); // Refresh state to see if it partially succeeded
    }
  };
  
  // Ensure this helper function is defined
  const checkWinnerAccount = async (winnerAddress) => {
    try {
      const accountInfo = await indexerClient.lookupAccountByID(winnerAddress).do();
      console.log('Winner account info:', accountInfo);
      return accountInfo.account.amount >= 100_000; // Minimum balance of 0.1 VOI
    } catch (error) {
      console.error('Winner account check failed:', error);
      return false;
    }
  };

  const enterLottery = async () => {
    if (!activeAddress) {
      alert('Connect wallet first');
      return;
    }
    try {
      const atc = new algosdk.AtomicTransactionComposer();
      const sp = await algodClient.getTransactionParams().do();
      const paymentAmount = 500_000;

      const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: activeAddress,
        receiver: appAddress,
        amount: paymentAmount,
        suggestedParams: sp,
      });

      const appCallTxn = algosdk.makeApplicationNoOpTxnFromObject({
        sender: activeAddress,
        suggestedParams: sp,
        appIndex: appId,
        appArgs: [enterSelector, algosdk.encodeUint64(paymentAmount)],
      });

      console.log('App Call appArgs (base64):', [
        btoa(String.fromCharCode(...enterSelector)),
        btoa(String.fromCharCode(...algosdk.encodeUint64(paymentAmount))),
      ]);

      const signer = async (unsignedTxns) => {
        const encodedTxns = unsignedTxns.map(txn => algosdk.encodeUnsignedTransaction(txn));
        return await signTransactions(encodedTxns);
      };
      atc.addTransaction({ txn: paymentTxn, signer });
      atc.addTransaction({ txn: appCallTxn, signer });

      console.log('Executing enterLottery transaction...');
      const result = await atc.execute(algodClient, 4);
      console.log('Transaction confirmed:', result);

      await fetchState();
    } catch (error) {
      console.error('Enter lottery error:', error);
      if (error.message.includes('Transaction not confirmed')) {
        console.log('Transaction may still have succeeded; checking state...');
        await fetchState();
      }
    }
  };

  const connectWallet = async () => {
    if (!wallets || wallets.length === 0) {
      console.error('No wallets available');
      return;
    }

    const wallet = wallets[0]; // Only one wallet is configured at a time

    if (!activeAddress) {
      try {
        await wallet.connect();
        console.log('Wallet connected, activeAddress:', activeAddress);
        if (activeAddress) fetchState();
      } catch (error) {
        console.error('Connection failed:', error);
      }
    } else {
      try {
        await wallet.disconnect();
        console.log('Wallet disconnected, activeAddress:', activeAddress);
      } catch (error) {
        console.error('Disconnection failed:', error);
      }
    }
  };

  return (
    <div>
      <h1>Voi Lottery Test</h1>
      <p>Connected Address: {activeAddress || 'Not connected'}</p>
      <p>Contract Balance: {balance} VOI</p>
      <p>Players: {players.length > 0 ? players.join(', ') : 'None'}</p>
      <p>Last Winner: {lastWinner || 'None'}</p>
      <button onClick={connectWallet}>
        {activeAddress ? 'Disconnect Wallet' : 'Connect Wallet'}
      </button>
      <button onClick={fetchState} disabled={!activeAddress}>Refresh State</button>
      <button onClick={enterLottery} disabled={!activeAddress}>Enter (0.5 VOI)</button>
      {activeAddress === managerAddress && (
        <button onClick={pickWinner} disabled={!activeAddress}>Pick Winner</button>
      )}
      <button onClick={onChangeWallet}>Change Wallet</button>
    </div>
  );
}

export default App;
