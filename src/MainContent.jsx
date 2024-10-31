
import React from 'react';

export function MainContent({
  walletConnected,
  walletBalance,
  fetchWalletBalance,
  connectPlugWallet,
  userPrincipal,
  activeTab,
  setActiveTab,
  principalId,
  setPrincipalId,
  fetchMinersData,
  error,
  miners,
  sortMiners,
  sortedMiners,
  groupedMiners,
  selectedMiners,
  setSelectedMiners,
  cycleTopUps,
  setCycleTopUps,
  totalMinersToTopUp,
  totalCyclesToTopUp,
  handleTopUpAll,
  formatToTrillions,
  calculateEstimatedTimeToRunOut,
  estimatedICP
}) {
  return (
    <div className="container">
      <header className="header">
        <h1>BOB-Manager</h1>
      </header>
      
      <div className="wallet-header">
        {walletConnected && (
          <div>
            Wallet Balance: {walletBalance === null ? 'Not fetched' : formatToTrillions(walletBalance)}
            <button onClick={fetchWalletBalance}>Fetch Balance</button>
          </div>
        )}
        <button onClick={connectPlugWallet}>
          {walletConnected ? `Connected: ${userPrincipal?.toText()}` : 'Connect Plug Wallet'}
        </button>
      </div>

      <div className="tab-navigation">
        <button onClick={() => setActiveTab('miners')}>Miners Data</button>
      </div>

      {activeTab === 'miners' && (
        <div className="miners-section">
          <div className="input-section">
            <input
              type="text"
              value={principalId}
              onChange={(e) => setPrincipalId(e.target.value)}
              placeholder="Enter Principal ID"
            />
            <button onClick={fetchMinersData}>Fetch Miners Data</button>
          </div>

          {error && <p className="error">{error}</p>}

          {miners.length > 0 && (
            <div className="miners-table-container">
              <h2>Miners Data (Total Miners: {miners.length})</h2>
              <table className="miners-table">
                <thead>
                  <tr>
                    <th><button onClick={() => sortMiners('index')}>Miner #</button></th>
                    <th><button onClick={() => sortMiners('id')}>Miner ID</button></th>
                    <th><button onClick={() => sortMiners('mined_blocks')}>Mined Blocks</button></th>
                    <th><button onClick={() => sortMiners('cycle_balance')}>Cycle Balance</button></th>
                    <th><button onClick={() => sortMiners('cycles_burned_per_round')}>Cycles Burned Per Round</button></th>
                    <th><button onClick={() => sortMiners('round_length_secs')}>Round Length (Seconds)</button></th>
                    <th><button onClick={() => sortMiners('estimated_time_to_run_out')}>Estimated Time to Run Out</button></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMiners.map((miner, index) => (
                    <tr key={miner.id.toText()}>
                      <td>{index + 1}</td>
                      <td>{miner.id.toText()}</td>
                      <td>{miner.mined_blocks.toString()}</td>
                      <td>{miner.stats ? formatToTrillions(miner.stats.cycle_balance) : 'N/A'}</td>
                      <td>{miner.stats ? formatToTrillions(miner.stats.cycles_burned_per_round) : 'N/A'}</td>
                      <td>{miner.stats ? miner.stats.round_length_secs.toString() : 'N/A'}</td>
                      <td>
                        {miner.stats ? 
                          (Number(miner.stats.cycle_balance) <= 0.0359 * 1_000_000_000_000 ? 
                            'Ran out of cycles' : 
                            calculateEstimatedTimeToRunOut(Number(miner.stats.cycle_balance), Number(miner.stats.cycles_burned_per_round))
                          ) : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="2">Totals:</td>
                    <td>
                      {sortedMiners.reduce((total, miner) => total + BigInt(miner.mined_blocks), 0n).toString()}
                    </td>
                    <td>
                      {formatToTrillions(sortedMiners.reduce((total, miner) => total + BigInt(miner.stats?.cycle_balance || 0), 0n))}
                    </td>
                    <td>
                      {formatToTrillions(sortedMiners.reduce((total, miner) => {
                        if (miner.stats && Number(miner.stats.cycle_balance) > 0.03 * 1_000_000_000_000) {
                          return total + BigInt(miner.stats.cycles_burned_per_round);
                        }
                        return total;
                      }, 0n))}
                    </td>
                    <td>Average Time to Run Out:</td>
                    <td>
                      {calculateEstimatedTimeToRunOut(
                        sortedMiners.reduce((total, miner) => total + Number(miner.stats?.cycle_balance || 0), 0) / sortedMiners.length,
                        sortedMiners.reduce((total, miner) => total + Number(miner.stats?.cycles_burned_per_round || 0), 0) / sortedMiners.length
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {Object.keys(groupedMiners).length > 0 && (
            <div className="grouped-miners">
              <h2>Grouped Miners Summary</h2>
              <table className="grouped-miners-table">
                <thead>
                  <tr>
                    <th>Cycles Burned Per Round (Trillion)</th>
                    <th>Number of Miners</th>
                    <th>Miners to Top-Up</th>
                    <th>Cycles to Add Per Miner (Trillion)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(groupedMiners)
                    .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
                    .map(([cyclesBurnedPerRound, minersGroup]) => (
                      <tr key={cyclesBurnedPerRound}>
                        <td>{formatToTrillions(cyclesBurnedPerRound)}</td>
                        <td>{minersGroup.length}</td>
                        <td className="input-cell">
                          <input
                            type="number"
                            min="0"
                            max={minersGroup.length}
                            value={selectedMiners[cyclesBurnedPerRound] || ''}
                            onChange={(e) => {
                              const value = Math.min(parseInt(e.target.value) || 0, minersGroup.length);
                              setSelectedMiners((prev) => ({
                                ...prev,
                                [cyclesBurnedPerRound]: value,
                              }));
                            }}
                          />
                        </td>
                        <td className="input-cell">
                          <input
                            type="number"
                            min="0"
                            value={cycleTopUps[cyclesBurnedPerRound] || ''}
                            onChange={(e) =>
                              setCycleTopUps((prev) => ({
                                ...prev,
                                [cyclesBurnedPerRound]: parseInt(e.target.value) || 0,
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>

              <div className="total-summary">
                <h3>Total Miners Selected for Top-Up: {totalMinersToTopUp}</h3>
                <h3>Total Cycles to Top-Up: {totalCyclesToTopUp} Trillion</h3>
                <h3>Estimated ICP Needed: {estimatedICP} ICP</h3>
                <button className="top-up-button" onClick={handleTopUpAll}>
                  Top Up All
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
