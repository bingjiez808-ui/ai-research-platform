import { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Login from './components/Login/Login';
import Sidebar from './components/Common/Sidebar';
import TopBar from './components/Common/TopBar';
import Dashboard from './components/Dashboard/Dashboard';
import StockDetail from './components/StockDetail/StockDetail';
import Portfolio from './components/Portfolio/Portfolio';
import DailyResearch from './components/DailyResearch/DailyResearch';
import AgentChat from './components/AgentChat/AgentChat';

const PAGES = {
  dashboard: '首页仪表盘',
  portfolio: '我的持仓',
  daily: 'AI 日报',
  agent: 'AI 助手',
};

function AppInner() {
  const { user } = useApp();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [selectedStock, setSelectedStock] = useState(null);

  if (!user) {
    return <Login />;
  }

  const handleStockSelect = (stock) => {
    setSelectedStock(stock);
    setCurrentPage('stockDetail');
  };

  const handleBackToDashboard = () => {
    setSelectedStock(null);
    setCurrentPage('dashboard');
  };

  return (
    <div className="app-layout">
      <Sidebar
        currentPage={currentPage}
        onNavigate={(page) => {
          setCurrentPage(page);
          if (page !== 'stockDetail') setSelectedStock(null);
        }}
      />
      <div className="main-content">
        <TopBar
          title={
            currentPage === 'stockDetail' && selectedStock
              ? `${selectedStock.name} (${selectedStock.code})`
              : PAGES[currentPage] || currentPage
          }
          showBack={currentPage === 'stockDetail'}
          onBack={handleBackToDashboard}
        />
        <div className="page-container">
          {currentPage === 'dashboard' && <Dashboard onStockSelect={handleStockSelect} />}
          {currentPage === 'stockDetail' && selectedStock && <StockDetail stock={selectedStock} onBack={handleBackToDashboard} />}
          {currentPage === 'portfolio' && <Portfolio onStockSelect={handleStockSelect} />}
          {currentPage === 'daily' && <DailyResearch onStockSelect={handleStockSelect} />}
          {currentPage === 'agent' && <AgentChat onStockSelect={handleStockSelect} />}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
