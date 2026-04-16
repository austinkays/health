import { useEffect, useState, useCallback } from 'react';
import { isAdminActive } from '../../services/ai';
import useAdminStats from '../admin/useAdminStats';
import StatsPanel from '../admin/StatsPanel';
import UserDrilldown from '../admin/UserDrilldown';
import FeedbackPanel from '../admin/FeedbackPanel';
import BetaInvitesPanel from '../admin/BetaInvitesPanel';

export default function Admin({ data, onNav }) {
  const isAdmin = isAdminActive(data?.settings);

  // Silently redirect non-admins to home so the page feels like it doesn't exist.
  useEffect(() => {
    if (!isAdmin) onNav('dash');
  }, [isAdmin, onNav]);

  // Shared stats fetch — feeds both StatsPanel and UserDrilldown.
  const { stats, loading: statsLoading, error: statsError, refresh: refreshStats } = useAdminStats();

  // Cross-panel state: UserDrilldown → FeedbackPanel filter hand-off.
  // Lives here because FeedbackPanel owns its own filter/items state,
  // but needs to be told "filter to this user id" from a sibling panel.
  const [userFilterId, setUserFilterId] = useState(null);

  const handleViewUserFeedback = useCallback((userId) => {
    setUserFilterId(userId);
    // Smooth scroll to the feedback section for clarity
    requestAnimationFrame(() => {
      window.scrollBy({ top: 200, behavior: 'smooth' });
    });
  }, []);

  const clearUserFilter = useCallback(() => setUserFilterId(null), []);

  if (!isAdmin) return null;

  return (
    <div className="space-y-4">
      <StatsPanel
        stats={stats}
        loading={statsLoading}
        error={statsError}
        onRefresh={refreshStats}
      />

      <UserDrilldown
        users={stats?.users_by_activity_7d}
        onViewUserFeedback={handleViewUserFeedback}
      />

      <FeedbackPanel
        userFilterId={userFilterId}
        onClearUserFilter={clearUserFilter}
      />

      <BetaInvitesPanel />
    </div>
  );
}
