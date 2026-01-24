type TabType = 'posts' | 'replies' | 'boosts' | 'settings';

interface ProfileTabsProps {
  activeTab: TabType;
  showBoosts: boolean;
  showSettings?: boolean;
  onTabChange: (tab: TabType) => void;
}

export function ProfileTabs({ activeTab, showBoosts, showSettings, onTabChange }: ProfileTabsProps) {
  return (
    <ul className="nav nav-tabs mb-3">
      <li className="nav-item">
        <button
          className={`nav-link ${activeTab === 'posts' ? 'active' : ''}`}
          onClick={() => onTabChange('posts')}
        >
          Posts
        </button>
      </li>
      <li className="nav-item">
        <button
          className={`nav-link ${activeTab === 'replies' ? 'active' : ''}`}
          onClick={() => onTabChange('replies')}
        >
          Replies
        </button>
      </li>
      {showBoosts && (
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'boosts' ? 'active' : ''}`}
            onClick={() => onTabChange('boosts')}
          >
            Boosts
          </button>
        </li>
      )}
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
