type TabType = 'posts' | 'replies' | 'boosts' | 'boosts_posts' | 'settings';

interface ProfileTabsProps {
  activeTab: TabType;
  showBoosts: boolean;
  showSettings?: boolean;
  actorType?: 'Person' | 'Group';
  onTabChange: (tab: TabType) => void;
}

export function ProfileTabs({ activeTab, showBoosts, showSettings, actorType, onTabChange }: ProfileTabsProps) {
  const isGroup = actorType === 'Group';

  const contentTabs: { key: TabType; label: string; show: boolean }[] = isGroup
    ? [
        { key: 'boosts_posts', label: 'Boosted posts', show: showBoosts },
        { key: 'boosts', label: 'Boosted all', show: showBoosts },
        { key: 'posts', label: 'Posts', show: true },
        { key: 'replies', label: 'Replies', show: true },
      ]
    : [
        { key: 'posts', label: 'Posts', show: true },
        { key: 'replies', label: 'Replies', show: true },
        { key: 'boosts', label: 'Boosts', show: showBoosts },
      ];

  return (
    <ul className="nav nav-tabs mb-3">
      {contentTabs.filter(t => t.show).map(tab => (
        <li key={tab.key} className="nav-item">
          <button
            className={`nav-link ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </button>
        </li>
      ))}
      {showSettings && (
        <li className="nav-item ms-auto">
          <button
            className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => onTabChange('settings')}
            title="Settings"
          >
            <i className="bi bi-gear-fill"></i>
          </button>
        </li>
      )}
    </ul>
  );
}
