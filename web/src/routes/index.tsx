import { useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  useActiveConversationId,
  useConversations,
  useCreateConversation,
  useSetActiveConversation,
} from '@/store';
import { Loader } from '@/components/ai-elements/loader';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

function IndexPage() {
  const navigate = useNavigate();
  const activeId = useActiveConversationId();
  const conversations = useConversations();
  const createConversation = useCreateConversation();
  const setActiveConversation = useSetActiveConversation();

  useEffect(() => {
    // If we have an active ID, redirect to it
    if (activeId) {
      navigate({ to: `/c/${activeId}`, replace: true });
      return;
    }

    // Try to find the most recent conversation
    const ids = Object.keys(conversations);
    const sortedIds = ids.sort((a, b) => conversations[b].updatedAt - conversations[a].updatedAt);

    if (sortedIds.length > 0) {
      setActiveConversation(sortedIds[0]);
      navigate({ to: `/c/${sortedIds[0]}`, replace: true });
    } else {
      // Create new
      const newId = createConversation();
      if (newId) {
        navigate({ to: `/c/${newId}`, replace: true });
      }
    }
  }, [activeId, conversations, createConversation, navigate, setActiveConversation]);

  return (
    <div className="min-h-screen bg-terminal-bg flex items-center justify-center">
      <Loader size={32} />
    </div>
  );
}
