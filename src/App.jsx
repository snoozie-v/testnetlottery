import React, { useState, useEffect } from 'react';
import algosdk from 'algosdk';
import { WalletProvider, WalletId, WalletManager, NetworkConfigBuilder, useWallet } from '@txnlab/use-wallet-react';
import { AlgorandClient, microAlgos, populateAppCallResources } from '@algorandfoundation/algokit-utils';
import {Buffer} from 'buffer'
import './App.css'
import walletImage from './assets/walletconnect.png';
import navMenu from './assets/navmenu.png';
import logo2 from './assets/pxlmob.png';
import tokenImg from './assets/pixToken.jpg'

window.Buffer = window.buffer || Buffer

const algorand = AlgorandClient.fromConfig({
  algodConfig: {
    server: "https://testnet-api.voi.nodely.dev",
  }
});

const networks = new NetworkConfigBuilder()
  .addNetwork('voi-mainnet', {
    algod: {
      token: '',
      baseServer: 'https://mainnet-api.voi.nodely.dev',
      port: ''
    },
    isTestnet: false,
    genesisHash: 'r20fSQI8gWe/kFZziNonSPCXLwcQmH/nxROvnnueWOk=',
    genesisId: 'voimain-v1.0',
  })
  .addNetwork('voi-testnet', {
    algod: {
      token: '',
      baseServer: 'https://testnet-api.voi.nodely.dev',
      port: ''
    },
    isTestnet: true,
    genesisHash: 'mufvzhECYAe3WaU075v0z4k1/SNUIuUPCyBTE+Z/08s==',
    genesisId: 'voitest-v1.1'
  })
  .build()

// Initialize WalletManager with LUTE only
const walletManager = new WalletManager({
  wallets: [
// to do: add KIBISIS and update front end to allow wallet selection
    // WalletId.KIBISIS, 
    {
      id: WalletId.LUTE,
      options: {
        siteName: "PiX Lottery"
      }
    }
  ],
  networks,
  defaultNetwork: 'voi-testnet', 
});
walletManager.setActiveNetwork('voi-testnet')

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

  const appId = 57177; // Pix Lotto TestNet
  const tokenId = 57173 // PiX Take 2 (arc200 on testNet)  

  // const algodClient = new algosdk.Algodv2('', 'https://testnet-api.voi.nodely.dev', '');
  // const indexerClient = new algosdk.Indexer('', 'https://testnet-idx.voi.nodely.dev', '');
  
  const appAddress = 'BKEA7LRIJMZBCRXYW7NFHU2J2QRTTUCH2W6DRJBTKCAP5DHP4PAH6GID44';
  const managerAddress = '5P6FEAD3ASNYIW6MADC6CJ5SVQR77L72NTKO7TNMBHPHLII3JKOJZRER2I';

  // Set the signer for AlgorandClient when activeAddress and transactionSigner are available
  useEffect(() => {
    if (activeAddress && transactionSigner) {
      algorand.account.setSigner(activeAddress, transactionSigner);
      console.log('Signer set for address:', activeAddress);
    }
  }, [activeAddress, transactionSigner]);

  const connectWallet = async () => {
    if (!wallets || wallets.length === 0) {
      console.error('No wallets available');
      return;
    }

    const wallet = wallets[0]; // Only Lute is configured

    if (!activeAddress) {
      try {
        await wallet.connect();
        console.log('Wallet connected, activeAddress:', activeAddress);
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

  const approveLottery = async () => {
    const amount = BigInt(10000000); // 10 tokens, assuming 6 decimals
    const spender = appAddress;
    const approve = algosdk.ABIMethod.fromSignature('arc200_approve(address,uint256)bool');
    // const arc200AppId = 57173;

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
  };

  const enterLottery = async () => {
    const paymentAmount = 1_000_000;
    const enter = algosdk.ABIMethod.fromSignature('enter(uint64)void')
    const result = await algorand
      .newGroup()
      .addAppCallMethodCall({
        sender: activeAddress,
        appId: appId,
        method: enter,
        args: [paymentAmount],
        staticFee: microAlgos(2000)
      })
      .send({
        populateAppCallResources: true,
      })
      console.log(result)
    }

  const pickWinner = async () => {
    try {
      const pickWinnerMethod = algosdk.ABIMethod.fromSignature('pick_winner()address');
      const appCall = algorand.newGroup();
  
      // Simulate the transaction
      const simulation = await appCall
        .addAppCallMethodCall({
          sender: activeAddress,
          appId: appId, // Ensure this is 57177
          method: pickWinnerMethod,
          staticFee: microAlgos(2000),
        })
        .simulate({
          allowUnnamedResources: true,
          allowEmptySignatures: true,
        });
  
      // Log simulation response for debugging
      console.log('Simulation response:', JSON.stringify(simulation, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value, 2));
      console.log('Resources accessed:', simulation.simulateResponse.txnGroups[0].unnamedResourcesAccessed);
      console.log('Apps accessed:', simulation.simulateResponse.txnGroups[0].unnamedResourcesAccessed.apps);
      console.log('Boxes accessed:', simulation.simulateResponse.txnGroups[0].unnamedResourcesAccessed.boxes);
  
      // Extract resources from simulation
      const unnamedResources = simulation.simulateResponse.txnGroups[0].unnamedResourcesAccessed || {};
  
      // Format app references
      const appsReferenced = (unnamedResources.apps || []).map(app => (app)); // Keep as bigint
  
      // Format box references as [appId, "base64 value"]
      const boxesReferenced = (unnamedResources.boxes || []).map(box => {
        const nameAsBase64 = Buffer.from(box.name).toString('base64');
        console.log(`Box app: ${box.app}, name (Base64): ${nameAsBase64}`);
        return {
          appId: Number(box.app), // Convert bigint to number
          name: nameAsBase64, // Base64 string
        };
      });
  
      // Log formatted resources
      console.log('App references:', appsReferenced);
      console.log('Box references:', boxesReferenced);

  
      // Add app call with populated resources
      const result = await appCall
        .addAppCallMethodCall({
          sender: activeAddress,
          appId: appId, // Ensure this is 57177
          method: pickWinnerMethod,
          staticFee: microAlgos(2000),
          appReferences: appsReferenced, // Array of bigint
          boxReferences: boxesReferenced // Array of [appId: number, base64: string]
        })
        .send({
          populateAppCallResources: true,
        });
  
      console.log('Pick winner result:', result);
    } catch (error) {
      console.error('Pick winner error:', error.message);
    }
  };
  
  // const pickWinner = async () => {
  //   try {
  //     const pickWinnerMethod = algosdk.ABIMethod.fromSignature('pick_winner()address');
  //     const result = await algorand
  //       .newGroup()
  //       .addAppCallMethodCall({
  //         sender: activeAddress,
  //         appId: 57177, // Lottery app ID
  //         method: pickWinnerMethod,
  //         staticFee: microAlgos(2000),
  //         appReferences: [57173n], 
  //         boxReferences: [
  //           { appId: 57173n, name: Buffer.from('YmFsYW5jZXMKiA+uKEsyEUb4t9pT00nUIznQR9W8OKQzUID+jO/jwA==', 'base64') },
  //           { appId: 57173n, name: Buffer.from('YmFsYW5jZXPr/FIAewSbhFvMAMXhJ7KsI/+v+mzU782sCd51oRtKnA==', 'base64') },
  //           { appId: 57173n, name: Buffer.from('YmFsYW5jZXMDNO8tpMJU83xMp5yMW34zit+ZQD9O+TpCXLmi/KIdZA==', 'base64') },
  //           { appId: 57177n, name: Buffer.from('cGxheWVycw==', 'base64') },
  //         ]
  //       })
  //       .send({
  //         populateAppCallResources: true,
  //       });
  //     console.log('Pick winner result:', result);
  //   } catch (error) {
  //     console.error('Pick winner error:', error.message);
  //   }
  // };

  const getLastWinner = async () => {
    const globalState = await algorand.app.getGlobalState(appId);
    const lastWinnerRaw = globalState['last_winner']?.valueRaw; // get the raw bytes
    if (lastWinnerRaw) {
      const lastWinnerAddress = algosdk.encodeAddress(new Uint8Array(lastWinnerRaw));
      console.log(lastWinnerAddress);
      setLastWinner(lastWinnerAddress)
    } else {
      console.log('No last_winner found');
    }
  };

  const getTknBalance = async () => {
    // Fetch the global state for the app
    const globalState = await algorand.app.getGlobalState(appId);
    // The key in global state is usually base64 or UTF-8 encoded
    // Adjust 'tkn_balance' to match the actual key name used in your contract
    const tknBalance = globalState['tkn_balance']?.value;
    const finalBalance = Number(tknBalance) / 1000000
    // Update your app/UI with the balance
    console.log('Token Balance:', tknBalance);
    console.log('Final Balance:', finalBalance)
    setBalance(finalBalance)
    setPlayers(finalBalance)
  };

  return (
    <div className='main'>
      <div className="header-container">
      <div className="left">
        <img
          id="walletImage"
          src={walletImage}
          alt="Wallet image"
          onClick={() => connectWallet(wallets)}
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
        // onClick={handleLogoClick} 
        className="clickable"   
      />
      <div className="right">
        <img
          id="navMenu"
          src={navMenu}
          alt="Nav Menu"
          // onClick={handleNavMenuClick}
          className="clickable"
        />
      </div>
    </div>
      <h1>PiX Lottery</h1>
      <img className="pix-image" src={tokenImg} alt="$PiX Token" />
      {/* <p>Connected Address: {activeAddress || 'Not connected'}</p> */}

      <p>If you've never played, first approve the lottery by clicking below</p>
      <button onClick={approveLottery} disabled={!activeAddress}>Approve</button>

      <p>Once approved, enter the lottery by clicking Enter and signing the transaction</p>
      <button onClick={enterLottery} disabled={!activeAddress}>Enter (1 PiX)</button>
      <p>Number of Players: {players} / 31   ||  Prize Balance: {balance} PiX</p>
      <p></p>
      <button onClick={getTknBalance} disabled={!activeAddress}>Check Prize Balance</button>
 
      <p>Last Winner: {lastWinner || 'None'}</p>
      <button onClick={getLastWinner} disabled={!activeAddress}>Get Last Winner</button>
      {/* <button onClick={fetchState} disabled={!activeAddress}>Refresh State</button> */}
      {activeAddress === managerAddress && (
        <div>
          <p>Only the manager of the lottery can see this and pick the winner.</p>
          <button onClick={pickWinner} disabled={!activeAddress}>Pick Winner</button>
        </div>
      )}

    </div>
  );
}

export default App;

      {/* <button onClick={connectWallet}>
        {activeAddress ? 'Disconnect Wallet' : 'Connect with Lute'}
      </button> */}
