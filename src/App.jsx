import React, { useState, useEffect } from 'react';
import algosdk from 'algosdk';
import { WalletProvider, WalletId, WalletManager, NetworkConfigBuilder, useWallet } from '@txnlab/use-wallet-react';
import { AlgorandClient, microAlgos } from '@algorandfoundation/algokit-utils';
import { Buffer } from 'buffer';
import './App.css';
import walletImage from './assets/walletconnect.png';
import navMenu from './assets/navmenu.png';
import logo2 from './assets/pxlmob.png';
import tokenImg from './assets/pixToken.jpg';

window.Buffer = window.Buffer || Buffer;

const algorand = AlgorandClient.fromConfig({
  algodConfig: {
    server: 'https://testnet-api.voi.nodely.dev',
  },
});

const networks = new NetworkConfigBuilder()
  .addNetwork('voi-mainnet', {
    algod: {
      token: '',
      baseServer: 'https://mainnet-api.voi.nodely.dev',
      port: '',
    },
    isTestnet: false,
    genesisHash: 'r20fSQI8gWe/kFZziNonSPCXLwcQmH/nxROvnnueWOk=',
    genesisId: 'voimain-v1.0',
  })
  .addNetwork('voi-testnet', {
    algod: {
      token: '',
      baseServer: 'https://testnet-api.voi.nodely.dev',
      port: '',
    },
    isTestnet: true,
    genesisHash: 'mufvzhECYAe3WaU075v0z4k1/SNUIuUPCyBTE+Z/08s==',
    genesisId: 'voitest-v1.1',
  })
  .build();

const walletManager = new WalletManager({
  wallets: [
    {
      id: WalletId.LUTE,
      options: {
        siteName: 'PiX Lottery',
      },
    },
  ],
  networks,
  defaultNetwork: 'localnet',
});
walletManager.setActiveNetwork('localnet');

function App() {
  return (
    <WalletProvider manager={walletManager}>
      <LotteryComponent />
    </WalletProvider>
  );
}

function LotteryComponent() {
  const { activeAddress, transactionSigner, wallets } = useWallet();
  const [balance, setBalance] = useState(0);
  const [players, setPlayers] = useState([]);
  const [lastWinner, setLastWinner] = useState('');
  const [allowance, setAllowance] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isEntering, setIsEntering] = useState(false);
  const [isLoadingState, setIsLoadingState] = useState(false);
  const [error, setError] = useState(null);

  const appId = 84465; // Test PiX Lotto Final
  const tokenId = 84463; // Test PiX Final
  const enterAmount = 1_000_000_000; // 1000 Test PiX as entry
  const appAddress = 'VSXNJRRCCPEXGMG6EP4M7NXI5J55I6HOK524OUMDRREPVOUYCVNOYN7V5A';
  const managerAddress = '5P6FEAD3ASNYIW6MADC6CJ5SVQR77L72NTKO7TNMBHPHLII3JKOJZRER2I';

  const isApproved = allowance !== null && allowance >= BigInt(enterAmount);

  // Auto-update balance and last winner
  const fetchLotteryState = async () => {
    setIsLoadingState(true);
    try {
      // Fetch token balance
      const globalState = await algorand.app.getGlobalState(appId);
      const tknBalance = globalState['tkn_balance']?.value;
      if (tknBalance !== undefined) {
        const finalBalance = Number(tknBalance) / 1_000_000;
        const playersBalance = Number(finalBalance) / 1_000
        // console.log('Token Balance:', tknBalance);
        // console.log('Final Balance:', finalBalance);
        // console.log('Players Balance:', playersBalance)
        setBalance(finalBalance);
        setPlayers(playersBalance);
      } else {
        console.warn('No tkn_balance found');
      }

      // Fetch last winner
      const lastWinnerRaw = globalState['last_winner']?.valueRaw;
      if (lastWinnerRaw) {
        const lastWinnerAddress = algosdk.encodeAddress(new Uint8Array(lastWinnerRaw));
        // console.log('Last winner:', lastWinnerAddress);
        setLastWinner(lastWinnerAddress);
      } else {
        console.log('No last_winner found');
        setLastWinner('None');
      }
    } catch (error) {
      console.error('Fetch lottery state error:', error);
      setError('Failed to update lottery state. Please try again later.');
    }
    setIsLoadingState(false);
  };

  // Run fetchLotteryState on mount and every 30 seconds
  useEffect(() => {
    fetchLotteryState(); // Initial fetch
    const interval = setInterval(fetchLotteryState, 30_000); // Update every 30 seconds
    return () => clearInterval(interval); // Cleanup on unmount
  }, []);

  useEffect(() => {
    if (activeAddress && transactionSigner) {
      algorand.account.setSigner(activeAddress, transactionSigner);
      // console.log('Signer set for address:', activeAddress);
    }
  }, [activeAddress, transactionSigner]);

  const connectWallet = async () => {
    if (!wallets || wallets.length === 0) {
      console.error('No wallets available');
      setError('No wallets available. Please try again.');
      return;
    }

    const wallet = wallets[0];
    if (!activeAddress) {
      try {
        await wallet.connect();
        // console.log('Wallet connected, activeAddress:', activeAddress);
      } catch (error) {
        console.error('Connection failed:', error);
        setError('Failed to connect wallet. Please try again.');
      }
    } else {
      try {
        await wallet.disconnect();
        // console.log('Wallet disconnected');
        setAllowance(null);
      } catch (error) {
        console.error('Disconnection failed:', error);
        setError('Failed to disconnect wallet. Please try again.');
      }
    }
  };

  const approveLottery = async () => {
    setIsApproving(true);
    setError(null);
    try {
      const amount = BigInt(10_000_000_000);
      const spender = appAddress;
      const approve = algosdk.ABIMethod.fromSignature('arc200_approve(address,uint256)bool');
      const result = await algorand
        .newGroup()
        .addAppCallMethodCall({
          sender: activeAddress,
          appId: tokenId,
          method: approve,
          args: [spender, amount],
        })
        .send({
          populateAppCallResources: true,
        });
      console.log('Approval result:', result);
      setAllowance(amount);
    } catch (error) {
      console.error('Approval error:', error);
      setError('Failed to approve contract. Check your wallet and try again.');
    }
    setIsApproving(false);
  };

  const checkAllowance = async () => {
    setIsChecking(true);
    setError(null);
    try {
      const owner = activeAddress;
      const spender = appAddress;
      const allowanceMethod = algosdk.ABIMethod.fromSignature('arc200_allowance(address,address)uint256');
      const result = await algorand
        .newGroup()
        .addAppCallMethodCall({
          sender: activeAddress,
          appId: tokenId,
          method: allowanceMethod,
          args: [owner, spender],
        })
        .send({
          populateAppCallResources: true,
        });
      const allowanceValue = result.returns[0].returnValue;
      // console.log('Allowance:', allowanceValue);
      setAllowance(allowanceValue);
    } catch (error) {
      console.error('Check allowance error:', error);
      setError('Failed to check allowance. Please try again.');
    }
    setIsChecking(false);
  };

  const enterLottery = async () => {
    setIsEntering(true);
    setError(null);
    try {
      const enter = algosdk.ABIMethod.fromSignature('enter(uint64)void');
      const result = await algorand
        .newGroup()
        .addAppCallMethodCall({
          sender: activeAddress,
          appId: appId,
          method: enter,
          args: [enterAmount],
          staticFee: microAlgos(2000),
        })
        .send({
          populateAppCallResources: true,
        });
      console.log('Enter lottery result:', result);
      alert('Successfully entered the lottery!');
      await fetchLotteryState();
      // Locally update allowance (assuming contract deducts enterAmount)
      setAllowance((prev) => (prev >= BigInt(enterAmount) ? prev - BigInt(enterAmount) : BigInt(0)));

    } catch (error) {
      console.error('Enter lottery error:', error);
      setError('Failed to enter lottery. Ensure you have enough PiX and try again.');
    }
    setIsEntering(false);
  };

  const pickWinner = async () => {
    try {
      const pickWinnerMethod = algosdk.ABIMethod.fromSignature('pick_winner()address');
      const appCall = algorand.newGroup();
      const simulation = await appCall
        .addAppCallMethodCall({
          sender: activeAddress,
          appId: appId,
          method: pickWinnerMethod,
          staticFee: microAlgos(3000),
        })
        .simulate({
          allowUnnamedResources: true,
          allowEmptySignatures: true,
        });

      // console.log('Simulation response:', JSON.stringify(simulation, (key, value) =>
      //   typeof value === 'bigint' ? value.toString() : value, 2));

      const unnamedResources = simulation.simulateResponse.txnGroups[0].unnamedResourcesAccessed || {};
      const appsReferenced = (unnamedResources.apps || []).map(app => (app));
      const boxesReferenced = (unnamedResources.boxes || []).map(box => ({
        appId: Number(box.app),
        name: Buffer.from(box.name).toString('base64'),
      }));

      const result = await appCall
        .addAppCallMethodCall({
          sender: activeAddress,
          appId: appId,
          method: pickWinnerMethod,
          staticFee: microAlgos(2000),
          appReferences: appsReferenced,
          boxReferences: boxesReferenced,
        })
        .send({
          populateAppCallResources: true,
        });

      console.log('Pick winner result:', result);
    } catch (error) {
      console.error('Pick winner error:', error.message);
      setError('Failed to pick winner. Please try again.');
    }
  };

  return (
    <div className="main">
      <div className="header-container">
        <div className="left">
          <img
            id="walletImage"
            src={walletImage}
            alt="Wallet connect"
            onClick={connectWallet}
            className="clickable"
          />
          {activeAddress && (
            <div className="wallet-address-display">
              {activeAddress.slice(0, 6)}...{activeAddress.slice(-4)}
            </div>
          )}
        </div>
        <img
          id="logo"
          src={logo2}
          alt="Pxlmob Logo"
          className="clickable"
        />
        <div className="right">
          <img
            id="navMenu"
            src={navMenu}
            alt="Nav Menu"
            className="clickable"
          />
        </div>
      </div>
      <h1>PiX Lottery</h1>
      <img className="pix-image" src={tokenImg} alt="$PiX Token" />

      {/* Lottery State Section */}
      <div className="lottery-state" style={{ maxWidth: '600px', margin: '1rem auto', padding: '1rem', textAlign: 'center' }}>
        {isLoadingState ? (
          <p>Loading lottery state...</p>
        ) : (
          <>
            <p style={{ fontWeight: 'bold', margin: '0.5rem 0' }}>
              Number of Players: {players} / 31 || Prize Balance: {balance} PiX
            </p>
            <p style={{ margin: '0.5rem 0' }}>
              Last Winner: {lastWinner || 'None'}
            </p>
          </>
        )}
      </div>

      {/* Lottery Interaction Section */}
      <div className="lottery-container" style={{ maxWidth: '600px', margin: '2rem auto', padding: '1rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        {!activeAddress ? (
          <div className="step" style={{ marginBottom: '1.5rem' }}>
            <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Step 1: Connect Wallet</p>
            <p>Please connect your wallet to participate in the PiX Lottery.</p>
            <button
              onClick={connectWallet}
              style={{ padding: '0.5rem 1rem', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '0.5rem' }}
              aria-label="Connect wallet"
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <>
            <div className="step" style={{ marginBottom: '1.5rem' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Step 1: Check Allowance</p>
              {allowance !== null ? (
                <p>
                  Allowance: {Number(allowance / 1_000_000n).toFixed(2)} PiX{' '}
                  {isApproved ? '✅ Approved' : '❌ Not Approved'}
                </p>
              ) : (
                <p>Check if the lottery contract is approved to spend your PiX tokens.</p>
              )}
              <button
                onClick={checkAllowance}
                disabled={isChecking || allowance !== null}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: isChecking || allowance !== null ? '#cccccc' : '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isChecking || allowance !== null ? 'not-allowed' : 'pointer',
                  marginTop: '0.5rem',
                }}
                aria-label="Check token allowance"
                aria-disabled={isChecking || allowance !== null}
              >
                {isChecking ? 'Checking...' : 'Check Allowance'}
              </button>
            </div>

            {allowance !== null && !isApproved && (
              <div className="step" style={{ marginBottom: '1.5rem' }}>
                <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Step 2: Approve Contract</p>
                <p>Approve the lottery contract to spend 1 PiX on your behalf.</p>
                <button
                  onClick={approveLottery}
                  disabled={isApproving}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: isApproving ? '#cccccc' : '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isApproving ? 'not-allowed' : 'pointer',
                    marginTop: '0.5rem',
                  }}
                  aria-label="Approve lottery contract"
                  aria-disabled={isApproving}
                >
                  {isApproving ? 'Approving...' : 'Approve'}
                </button>
              </div>
            )}

            <div className="step" style={{ marginBottom: '1.5rem' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Step 3: Enter Lottery</p>
              <p>Enter the lottery for 1,000 PiX by signing the transaction.</p>
              <button
                onClick={enterLottery}
                disabled={!isApproved || isEntering}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: !isApproved || isEntering ? '#cccccc' : '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: !isApproved || isEntering ? 'not-allowed' : 'pointer',
                  marginTop: '0.5rem',
                }}
                aria-label="Enter lottery"
                aria-disabled={!isApproved || isEntering}
                title={!isApproved ? 'Complete previous steps to enable' : ''}
              >
                {isEntering ? 'Entering...' : 'Enter (1k PiX)'}
              </button>
            </div>

            {error && <p style={{ color: 'red', marginTop: '1rem' }}>{error}</p>}
          </>
        )}
      </div>

      {activeAddress === managerAddress && (
        <div>
          <p>Only the manager of the lottery can see this and pick the winner.</p>
          <button
            onClick={pickWinner}
            disabled={!activeAddress}
            style={{ padding: '0.5rem 1rem', backgroundColor: !activeAddress ? '#cccccc' : '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: !activeAddress ? 'not-allowed' : 'pointer', margin: '0.5rem 0' }}
          >
            Pick Winner
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
