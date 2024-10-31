import React, { useState, useEffect } from 'react';
import { HttpAgent, Actor } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { IDL } from '@dfinity/candid';
import './index.scss';
import { MainContent } from './MainContent';

// IDL Factories
const idlFactoryGetMiners = ({ IDL }) => {
  return IDL.Service({
    'get_miners': IDL.Func(
      [IDL.Principal],
      [IDL.Vec(IDL.Record({ 'id': IDL.Principal, 'mined_blocks': IDL.Nat64 }))],
      ['query'],
    ),
  });
};

const idlFactory = ({ IDL }) => {
  const Subaccount = IDL.Vec(IDL.Nat8);
  const AccountIdentifier = IDL.Vec(IDL.Nat8);
  const IcpXdrConversionRate = IDL.Record({
    'xdr_permyriad_per_icp': IDL.Nat64,
    'timestamp_seconds': IDL.Nat64,
  });
  const IcpXdrConversionRateResponse = IDL.Record({
    'certificate': IDL.Vec(IDL.Nat8),
    'data': IcpXdrConversionRate,
    'hash_tree': IDL.Vec(IDL.Nat8),
  });
  const ConvertExactICP2CyclesFromNNSCMCResponseType = IDL.Record({
    'logs': IDL.Vec(IDL.Text),
    'cygnusCycleBalanceBeforeConversion': IDL.Nat,
    'cygnusCycleBalanceAbsoluteDifference': IDL.Nat,
    'conversionSuccessful': IDL.Bool,
    'cygnusCycleBalanceAfterConversion': IDL.Nat,
  });

  return IDL.Service({
    'accountIdentifier': IDL.Func(
      [IDL.Principal, Subaccount],
      [AccountIdentifier],
      [],
    ),
    'add_cycles': IDL.Func([IDL.Text, IDL.Nat], [IDL.Text], []),
    'get_icp_xdr_conversion_rate': IDL.Func(
      [],
      [IcpXdrConversionRateResponse],
      [],
    ),
    'icp_balance': IDL.Func([], [IDL.Nat], []),
    'mintCycles': IDL.Func(
      [
        IDL.Record({
          'e8ICP': IDL.Nat,
          'recipientCanisterId': IDL.Principal,
        }),
      ],
      [IDL.Opt(ConvertExactICP2CyclesFromNNSCMCResponseType)],
      [],
    ),
    'principalToSubAccount': IDL.Func(
      [IDL.Principal],
      [IDL.Vec(IDL.Nat8)],
      [],
    ),
    'top_up_canisters': IDL.Func(
      [
        IDL.Vec(
          IDL.Record({ 'topUpAmount': IDL.Nat, 'minerId': IDL.Text })
        ),
      ],
      [IDL.Vec(IDL.Opt(ConvertExactICP2CyclesFromNNSCMCResponseType))],
      [],
    ),
  });
};

const idlFactoryGetStatistics = ({ IDL }) => {
  return IDL.Service({
    'get_statistics_v2': IDL.Func(
      [],
      [IDL.Record({
        'cycles_burned_per_round': IDL.Nat,
        'last_round_cyles_burned': IDL.Nat,
        'round_length_secs': IDL.Nat64,
        'cycle_balance': IDL.Nat64,
      })],
      ['query'],
    ),
  });
};

// Canister IDs
const mainCanisterId = '6lnhz-oaaaa-aaaas-aabkq-cai';
const backendCanisterId = '7t6ad-qqaaa-aaaam-qbida-cai';

// Create an agent with IC's mainnet host
const agent = new HttpAgent({ host: 'https://ic0.app' });
const mainActor = Actor.createActor(idlFactoryGetMiners, { agent, canisterId: mainCanisterId });
const backendActor = Actor.createActor(idlFactory, { agent, canisterId: backendCanisterId });

// Whitelist for top-up access
const TOP_UP_WHITELIST = [
  '47jnd-g33eu-qomcn-tavu5-ewwhd-l7e5o-t2nrw-uvukr-zrqu5-hpqtd-3ae',
];

const calculateICPCost = async (cycles) => {
  try {
    const conversionRate = await backendActor.get_icp_xdr_conversion_rate();
    const XDR_RATE = Number(conversionRate.data.xdr_permyriad_per_icp) / 10000;
    const estimatedICP = Number(cycles) / XDR_RATE;
    console.log("Total cycles:", cycles, "XDR Rate:", XDR_RATE, "Estimated ICP:", estimatedICP);
    return estimatedICP;
  } catch (error) {
    console.error("Error calculating ICP cost:", error);
    throw error;
  }
};

// Helper function to format numbers to trillions
function formatToTrillions(value) {
  if (value === null || value === undefined) return 'N/A';
  const convertedValue = Number(value);
  if (isNaN(convertedValue)) return 'N/A';
  return `${(convertedValue / 1_000_000_000_000).toFixed(2)}T`;
}

// Helper function to calculate estimated time to run out
function calculateEstimatedTimeToRunOut(cycleBalance, cyclesBurnedPerRound) {
  if (cycleBalance === null || cyclesBurnedPerRound === null) return 'N/A';
  const estimatedHours = (cycleBalance / (cyclesBurnedPerRound * 15.04061));

  if (estimatedHours < 0.016667) { // Less than a minute
    return 'Less than a minute';
  }

  const days = Math.floor(estimatedHours / 24);
  const hours = Math.floor(estimatedHours % 24);
  const minutes = Math.floor((estimatedHours * 60) % 60);

  let result = '';
  if (days > 0) result += `${days} day${days > 1 ? 's' : ''} `;
  if (hours > 0) result += `${hours} hour${hours > 1 ? 's' : ''} `;
  if (minutes > 0) result += `${minutes} minute${minutes > 1 ? 's' : ''}`;

  return result.trim();
}

function App() {
  const [principalId, setPrincipalId] = useState('');
  const [userPrincipal, setUserPrincipal] = useState(null);
  const [miners, setMiners] = useState([]);
  const [groupedMiners, setGroupedMiners] = useState({});
  const [totalCycleBalance, setTotalCycleBalance] = useState(0n);
  const [error, setError] = useState('');
  const [selectedMiners, setSelectedMiners] = useState({});
  const [cycleTopUps, setCycleTopUps] = useState({});
  const [activeTab, setActiveTab] = useState('miners');
  const [totalMinersToTopUp, setTotalMinersToTopUp] = useState(0);
  const [totalCyclesToTopUp, setTotalCyclesToTopUp] = useState(0);
  const [estimatedICP, setEstimatedICP] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });
  const [isWalletConnected, setIsWalletConnected] = useState(false);
  const [debugMessages, setDebugMessages] = useState([]);

  const appendDebugMessage = (message) => {
    setDebugMessages((prevMessages) => [...prevMessages, message]);
  };

  const connectPlugWallet = async () => {
    if (!window.ic?.plug) {
      alert('Please install Plug wallet extension and connect.');
      appendDebugMessage('Plug wallet not found. Please install it.');
      return;
    }

    try {
      appendDebugMessage('Attempting to connect to Plug wallet...');
      const whitelist = [backendCanisterId];
      const host = 'https://ic0.app';
      
      // Request connection
      const connected = await window.ic.plug.requestConnect({
        whitelist,
        host,
      });

      if (!connected) {
        throw new Error('Failed to connect to Plug wallet');
      }

      // Create agent
      await window.ic.plug.createAgent({ whitelist, host });
      
      appendDebugMessage('Successfully connected to Plug wallet.');
      setIsWalletConnected(true);
      const principal = await window.ic.plug.agent.getPrincipal();
      setUserPrincipal(principal);
    } catch (error) {
      appendDebugMessage(`Error connecting to Plug wallet: ${error.message}`);
      setError(`Failed to connect wallet: ${error.message}`);
    }
  };

  const fetchWithTimeout = async (actor, methodName, args = [], timeout = 60000) => {
    return Promise.race([
      actor[methodName](...args),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), timeout)),
    ]);
  };

  const fetchMinerStatsWithRetry = async (minerActor, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fetchWithTimeout(minerActor, 'get_statistics_v2');
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  };

  const fetchMinersData = async () => {
    setError('');
    try {
      if (!principalId) {
        setError('Please enter a Principal ID');
        return;
      }

      const validatedPrincipal = Principal.fromText(principalId.trim());
      const minersData = await mainActor.get_miners(validatedPrincipal);

      if (!minersData || !Array.isArray(minersData)) {
        throw new Error('Invalid miners data received');
      }

      let totalBalance = 0n;

      const minersWithStats = await Promise.all(minersData.map(async (miner) => {
        try {
          const minerActor = Actor.createActor(idlFactoryGetStatistics, { agent, canisterId: miner.id });
          const stats = await fetchMinerStatsWithRetry(minerActor);

          const cycleBalance = Number(stats.cycle_balance);

          if (cycleBalance > 0.02 * 1_000_000_000_000) {
            totalBalance += BigInt(cycleBalance);
          }

          return {
            ...miner,
            stats,
          };
        } catch (err) {
          console.error(`Error fetching stats for miner ${miner.id.toText()}:`, err);
          return {
            ...miner,
            stats: null,
          };
        }
      }));

      setMiners(minersWithStats);
      setTotalCycleBalance(totalBalance);
      groupMinersByCyclesBurned(minersWithStats);
    } catch (err) {
      console.error('Error fetching miners data:', err);
      setError(err.message || 'An error occurred while fetching miners data');
      setMiners([]);
      setTotalCycleBalance(0n);
    }
  };

  const groupMinersByCyclesBurned = (miners) => {
    const grouped = {};
    miners.forEach((miner) => {
      const key = miner.stats?.cycles_burned_per_round || 'Unknown';
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(miner);
    });
    setGroupedMiners(grouped);
  };

  const updateTotalTopUpData = async () => {
    let totalMiners = 0;
    let totalCycles = 0;

    Object.entries(selectedMiners).forEach(([cyclesBurnedPerRound, numMiners]) => {
      const cycleTopUpAmount = cycleTopUps[cyclesBurnedPerRound] || 0;
      totalMiners += numMiners;
      totalCycles += numMiners * cycleTopUpAmount;
    });

    setTotalMinersToTopUp(totalMiners);
    setTotalCyclesToTopUp(totalCycles);

    try {
      if (totalCycles > 0) {
        const icpCost = await calculateICPCost(totalCycles);
        console.log("Total cycles:", totalCycles, "Estimated ICP cost:", icpCost);
        setEstimatedICP(icpCost);
      } else {
        setEstimatedICP(0);
      }
    } catch (error) {
      console.error("Error calculating ICP cost:", error);
      setError("Failed to calculate ICP cost");
    }
  };

  useEffect(() => {
    updateTotalTopUpData();
  }, [selectedMiners, cycleTopUps]);

  const sortMiners = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const sortedMiners = React.useMemo(() => {
    if (!miners || !Array.isArray(miners)) return [];
    
    if (sortConfig.key !== null) {
      return [...miners].sort((a, b) => {
        let aValue = a;
        let bValue = b;
        if (sortConfig.key === 'cycle_balance' || sortConfig.key === 'cycles_burned_per_round') {
          aValue = a.stats ? a.stats[sortConfig.key] : 0;
          bValue = b.stats ? b.stats[sortConfig.key] : 0;
        } else {
          aValue = a[sortConfig.key] || 0;
          bValue = b[sortConfig.key] || 0;
        }
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return miners;
  }, [miners, sortConfig]);

  const handleTopUpAll = async () => {
    if (!isWalletConnected) {
      setError("Please connect your wallet first.");
      return;
    }
    if (!userPrincipal || !TOP_UP_WHITELIST.includes(userPrincipal.toText())) {
      setError('You are not authorized to perform this action.');
      return;
    }

    try {
      // Prepare the top-up requests
      const topUpRequests = [];
      for (const [cyclesBurnedPerRound, numMiners] of Object.entries(selectedMiners)) {
        const topUpAmount = cycleTopUps[cyclesBurnedPerRound] || 0;
        const minersInGroup = groupedMiners[cyclesBurnedPerRound] || [];
        
        for (let i = 0; i < numMiners && i < minersInGroup.length; i++) {
          const miner = minersInGroup[i];
          topUpRequests.push({
            topUpAmount: topUpAmount,
            minerId: miner.id.toText()
          });
        }
      }

      // Call the backend to process all top-ups
      const results = await backendActor.top_up_canisters(topUpRequests);
      
      // Check results
      const failures = results.filter((result, index) => 
        !result || result.length === 0 || !result[0].conversionSuccessful
      );

      if (failures.length > 0) {
        setError(`Failed to top up ${failures.length} miners`);
      } else {
        setError('');
      }

      await fetchMinersData();
      
    } catch (error) {
      console.error('Error in top-up process:', error);
      setError(`Failed to complete top-up process: ${error.message}`);
    }
  };

  return (
    <MainContent
      walletConnected={isWalletConnected}
      connectPlugWallet={connectPlugWallet}
      userPrincipal={userPrincipal}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      principalId={principalId}
      setPrincipalId={setPrincipalId}
      fetchMinersData={fetchMinersData}
      error={error}
      miners={miners}
      sortMiners={sortMiners}
      sortedMiners={sortedMiners}
      groupedMiners={groupedMiners}
      selectedMiners={selectedMiners}
      setSelectedMiners={setSelectedMiners}
      cycleTopUps={cycleTopUps}
      setCycleTopUps={setCycleTopUps}
      totalMinersToTopUp={totalMinersToTopUp}
      totalCyclesToTopUp={totalCyclesToTopUp}
      estimatedICP={estimatedICP}
      handleTopUpAll={handleTopUpAll}
      formatToTrillions={formatToTrillions}
      calculateEstimatedTimeToRunOut={calculateEstimatedTimeToRunOut}
    />
  );
}

export default App;
