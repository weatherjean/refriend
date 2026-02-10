type TabType = 'posts' | 'replies' | 'boosts' | 'boosts_posts';

interface ProfileTabsProps {
  activeTab: TabType;
  showBoosts: boolean;
  actorType?: 'Person' | 'Group';
  onTabChange: (tab: TabType) => void;
}

export function ProfileTabs({ activeTab, showBoosts, actorType, onTabChange }: ProfileTabsProps) {
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
    </ul>
  );
}
