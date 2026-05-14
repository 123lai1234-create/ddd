import React, { useState } from 'react';

interface Tab {
  id: string;
  label: string;
  icon: string;
}

const tabs: Tab[] = [
  { id: 'research', label: '論文研究', icon: '📖' },
  { id: 'interactive', label: '互動體驗', icon: '⚡' },
  { id: 'tools', label: '技術工具', icon: '🛠' },
  { id: 'appendix', label: '附錄資料', icon: '📎' },
];

interface TabNavProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export default function TabNav({ activeTab, onTabChange }: TabNavProps) {
  return (
    <nav className="tab-nav">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}