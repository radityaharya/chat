import { useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useSetActiveConversation } from '@/store';
import { ChatInterface } from '@/components/chat/ChatInterface';

export const Route = createFileRoute('/c/$conversationId')({
  component: ConversationPage,
});

function ConversationPage() {
  const { conversationId } = Route.useParams();
  const setActiveConversation = useSetActiveConversation();

  useEffect(() => {
    if (conversationId) {
      setActiveConversation(conversationId);
    }
  }, [conversationId, setActiveConversation]);

  return <ChatInterface />;
}
