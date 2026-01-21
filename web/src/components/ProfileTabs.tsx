type TabType = 'posts' | 'replies' | 'boosts';

interface ProfileTabsProps {
  activeTab: TabType;
  showBoosts: boolean;
  onTabChange: (tab: TabType) => void;
}

export function ProfileTabs({ activeTab, showBoosts, onTabChange }: ProfileTabsProps) {
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
    </ul>
  );
}
