import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import workspaceService from '../services/workspaceService';
import chatService from '../services/chatService';
import realtimeService from '../services/realtimeService';
import Avatar from '../components/ui/Avatar';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';

export const ChatPage = () => {
  const { user: currentUser } = useAuth();

  // Workspace & Members
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [membersMap, setMembersMap] = useState({});
  const [workspaceMembersList, setWorkspaceMembersList] = useState([]);

  // Chat Resources
  const [channels, setChannels] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null); // { type: 'channel'|'conversation', data: object }
  const [searchQuery, setSearchQuery] = useState('');

  // Messages & Pagination
  const [messages, setMessages] = useState([]);
  const [pagination, setPagination] = useState({ hasMore: false, nextCursor: null });
  const [messageInput, setMessageInput] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Edit Message
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingContent, setEditingContent] = useState('');

  // Threads
  const [activeThreadRoot, setActiveThreadRoot] = useState(null);
  const [threadReplies, setThreadReplies] = useState([]);
  const [threadReplyInput, setThreadReplyInput] = useState('');
  const [isSendingThreadReply, setIsSendingThreadReply] = useState(false);

  // Modals & UI States
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
  const [newChannelForm, setNewChannelForm] = useState({ name: '', description: '', isPrivate: false });
  const [isDirectModalOpen, setIsDirectModalOpen] = useState(false);
  const [selectedRecipientId, setSelectedRecipientId] = useState('');

  // Status & Error Banners
  const [errorBanner, setErrorBanner] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const threadEndRef = useRef(null);

  // Scroll to bottom of message list
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // 1. Initialize Workspaces and Members on Mount
  useEffect(() => {
    let isMounted = true;

    async function loadWorkspaceContext() {
      try {
        const wsRes = await workspaceService.getWorkspaces();
        const wsList = wsRes.data || [];
        if (!isMounted) return;

        setWorkspaces(wsList);
        if (wsList.length > 0) {
          const defaultWsId = wsList[0].id;
          setActiveWorkspaceId(defaultWsId);

          // Load workspace members to map user IDs to actual names and initials
          try {
            const memRes = await workspaceService.getWorkspaceMembers(defaultWsId, { per_page: 100 });
            const memberArray = memRes.data?.data || memRes.data || [];
            if (isMounted) {
              setWorkspaceMembersList(memberArray);
              const map = {};
              memberArray.forEach((m) => {
                const uId = m.user_id || m.user?.id || m.id;
                const name = m.user?.name || m.name || `Member #${uId}`;
                const email = m.user?.email || m.email || '';
                map[uId] = { name, email, id: uId };
              });
              setMembersMap(map);
            }
          } catch (memErr) {
            console.warn('[ChatPage] Could not load workspace members:', memErr.message);
          }
        }
      } catch (err) {
        if (isMounted) {
          setErrorBanner(err.message || 'Failed to initialize workspace data.');
        }
      }
    }

    loadWorkspaceContext();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Load Channels & Conversations when activeWorkspaceId changes
  useEffect(() => {
    let ignore = false;
    if (!activeWorkspaceId) return;

    const fetchSidebar = async () => {
      try {
        const [chanRes, convRes] = await Promise.all([
          chatService.getChannels(activeWorkspaceId).catch(() => ({ data: [] })),
          chatService.getConversations(activeWorkspaceId).catch(() => ({ data: [] })),
        ]);

        if (ignore) return;

        const chanList = chanRes.data || [];
        const convList = convRes.data || [];

        setChannels(chanList);
        setConversations(convList);

        // Auto-select first channel or conversation if none selected
        setSelectedChat((current) => {
          if (current) {
            const exists =
              current.type === 'channel'
                ? chanList.some((c) => c._id === current.data._id)
                : convList.some((c) => c._id === current.data._id);
            if (exists) return current;
          }

          if (chanList.length > 0) {
            return { type: 'channel', data: chanList[0] };
          }
          if (convList.length > 0) {
            return { type: 'conversation', data: convList[0] };
          }
          return null;
        });
      } catch (err) {
        if (!ignore) {
          setErrorBanner(err.message || 'Failed to load chat channels and conversations.');
        }
      }
    };

    fetchSidebar();

    return () => {
      ignore = true;
    };
  }, [activeWorkspaceId]);

  // 3. Load Messages for the Selected Chat
  useEffect(() => {
    let ignore = false;

    if (!selectedChat || !activeWorkspaceId) {
      return;
    }

    const fetchMessages = async () => {
      try {
        setIsLoadingMessages(true);
        setErrorBanner('');

        let res;
        if (selectedChat.type === 'channel') {
          res = await chatService.getChannelMessages(activeWorkspaceId, selectedChat.data._id, { limit: 30 });
        } else {
          res = await chatService.getConversationMessages(activeWorkspaceId, selectedChat.data._id, { limit: 30 });
        }

        if (ignore) return;

        const rawMessages = res.data || [];
        const chronological = [...rawMessages].reverse();

        setMessages(chronological);
        setPagination(res.pagination || { hasMore: false, nextCursor: null });
        setActiveThreadRoot(null);
        setThreadReplies([]);
        setTimeout(() => scrollToBottom(false), 50);
      } catch (err) {
        if (!ignore) {
          setErrorBanner(err.response?.data?.message || err.message || 'Failed to load messages.');
        }
      } finally {
        if (!ignore) {
          setIsLoadingMessages(false);
        }
      }
    };

    fetchMessages();

    return () => {
      ignore = true;
    };
  }, [selectedChat, activeWorkspaceId, scrollToBottom]);

  // 4. Load Older Messages (Pagination)
  const handleLoadOlderMessages = async () => {
    if (!selectedChat || !activeWorkspaceId || !pagination.nextCursor || isLoadingOlder) return;

    setIsLoadingOlder(true);
    try {
      let res;
      if (selectedChat.type === 'channel') {
        res = await chatService.getChannelMessages(activeWorkspaceId, selectedChat.data._id, {
          beforeCursor: pagination.nextCursor,
          limit: 30,
        });
      } else {
        res = await chatService.getConversationMessages(activeWorkspaceId, selectedChat.data._id, {
          beforeCursor: pagination.nextCursor,
          limit: 30,
        });
      }

      const olderMessages = [...(res.data || [])].reverse();
      setMessages((prev) => [...olderMessages, ...prev]);
      setPagination(res.pagination || { hasMore: false, nextCursor: null });
    } catch (err) {
      setErrorBanner(err.message || 'Failed to load older messages.');
    } finally {
      setIsLoadingOlder(false);
    }
  };

  // 5. Realtime Socket.IO Connection & Event Handlers
  useEffect(() => {
    const socket = realtimeService.connect();
    if (!socket || !selectedChat) return;

    const chatId = selectedChat.data._id;
    const roomEvent = selectedChat.type === 'channel' ? 'chat:join:channel' : 'chat:join:conversation';
    const leaveEvent = selectedChat.type === 'channel' ? 'chat:leave:channel' : 'chat:leave:conversation';
    const roomParam = selectedChat.type === 'channel' ? { channelId: chatId } : { conversationId: chatId };

    // Join room
    socket.emit(roomEvent, roomParam);

    // Incoming Message Handler
    const handleNewMessage = (newMsg) => {
      const isTargetChat =
        (selectedChat.type === 'channel' && newMsg.channelId === chatId) ||
        (selectedChat.type === 'conversation' && newMsg.conversationId === chatId);

      if (isTargetChat) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === newMsg._id)) return prev;
          return [...prev, newMsg];
        });
        scrollToBottom(true);
      }

      // If active thread matches message's threadId, append to thread replies
      if (activeThreadRoot && newMsg.threadId && newMsg.threadId === activeThreadRoot.threadId) {
        setThreadReplies((prev) => {
          if (prev.some((m) => m._id === newMsg._id)) return prev;
          return [...prev, newMsg];
        });
        threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    };

    // Message Update Handler (Edited)
    const handleMessageUpdated = (updatedMsg) => {
      setMessages((prev) => prev.map((m) => (m._id === updatedMsg._id ? updatedMsg : m)));
      setThreadReplies((prev) => prev.map((m) => (m._id === updatedMsg._id ? updatedMsg : m)));
      if (activeThreadRoot && activeThreadRoot._id === updatedMsg._id) {
        setActiveThreadRoot(updatedMsg);
      }
    };

    // Message Deleted Handler
    const handleMessageDeleted = ({ _id, deletedAt }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === _id ? { ...m, deletedAt } : m))
      );
      setThreadReplies((prev) =>
        prev.map((m) => (m._id === _id ? { ...m, deletedAt } : m))
      );
    };

    socket.on('chat:message:new', handleNewMessage);
    socket.on('chat:message:updated', handleMessageUpdated);
    socket.on('chat:message:deleted', handleMessageDeleted);

    return () => {
      socket.emit(leaveEvent, roomParam);
      socket.off('chat:message:new', handleNewMessage);
      socket.off('chat:message:updated', handleMessageUpdated);
      socket.off('chat:message:deleted', handleMessageDeleted);
    };
  }, [selectedChat, activeThreadRoot, scrollToBottom]);

  // 6. Send Message Handler
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    const content = messageInput.trim();
    if (!content || !selectedChat || !activeWorkspaceId || isSending) return;

    setIsSending(true);
    setErrorBanner('');
    try {
      const payload = {
        content,
        conversationId: selectedChat.type === 'conversation' ? selectedChat.data._id : null,
        channelId: selectedChat.type === 'channel' ? selectedChat.data._id : null,
      };

      const res = await chatService.sendMessage(activeWorkspaceId, payload);
      const createdMsg = res.data;

      // Add to local state if not already received via socket
      setMessages((prev) => {
        if (prev.some((m) => m._id === createdMsg._id)) return prev;
        return [...prev, createdMsg];
      });

      setMessageInput('');
      scrollToBottom(true);
    } catch (err) {
      setErrorBanner(err.response?.data?.message || err.message || 'Failed to send message.');
    } finally {
      setIsSending(false);
    }
  };

  // 7. Edit Message Handler
  const handleSaveEdit = async (messageId) => {
    const trimmed = editingContent.trim();
    if (!trimmed || !activeWorkspaceId) return;

    try {
      const res = await chatService.editMessage(activeWorkspaceId, messageId, trimmed);
      const updated = res.data;
      setMessages((prev) => prev.map((m) => (m._id === messageId ? updated : m)));
      setEditingMessageId(null);
      setEditingContent('');
    } catch (err) {
      setErrorBanner(err.response?.data?.message || err.message || 'Failed to edit message.');
    }
  };

  // 8. Soft Delete Message Handler
  const handleDeleteMessage = async (messageId) => {
    if (!window.confirm('Are you sure you want to delete this message?')) return;

    try {
      const res = await chatService.deleteMessage(activeWorkspaceId, messageId);
      const deleted = res.data;
      setMessages((prev) => prev.map((m) => (m._id === messageId ? deleted : m)));
    } catch (err) {
      setErrorBanner(err.response?.data?.message || err.message || 'Failed to delete message.');
    }
  };

  // 9. Add / Remove Emoji Reaction
  const handleToggleReaction = async (messageId, emoji) => {
    if (!activeWorkspaceId) return;
    try {
      // Add reaction via service
      await chatService.addReaction(activeWorkspaceId, messageId, emoji);
      // Reload current messages to sync reactions
      if (selectedChat) {
        const res =
          selectedChat.type === 'channel'
            ? await chatService.getChannelMessages(activeWorkspaceId, selectedChat.data._id, { limit: 30 })
            : await chatService.getConversationMessages(activeWorkspaceId, selectedChat.data._id, { limit: 30 });
        setMessages([...(res.data || [])].reverse());
      }
    } catch (err) {
      setErrorBanner(err.response?.data?.message || err.message || 'Failed to add reaction.');
    }
  };

  // 10. Open Thread Panel
  const handleOpenThread = async (message) => {
    setActiveThreadRoot(message);
    setThreadReplies([]);
    try {
      const res = await chatService.getThread(activeWorkspaceId, message._id);
      setThreadReplies(res.data?.replies || []);
    } catch (err) {
      setErrorBanner(err.message || 'Failed to load thread.');
    }
  };

  // 11. Send Thread Reply
  const handleSendThreadReply = async (e) => {
    e?.preventDefault();
    const content = threadReplyInput.trim();
    if (!content || !activeThreadRoot || !activeWorkspaceId || isSendingThreadReply) return;

    setIsSendingThreadReply(true);
    try {
      const res = await chatService.createThreadReply(activeWorkspaceId, activeThreadRoot._id, content);
      const reply = res.data;
      setThreadReplies((prev) => [...prev, reply]);
      setThreadReplyInput('');
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      setErrorBanner(err.response?.data?.message || err.message || 'Failed to post thread reply.');
    } finally {
      setIsSendingThreadReply(false);
    }
  };

  // 12. Create New Channel Handler
  const handleCreateChannel = async (e) => {
    e.preventDefault();
    if (!newChannelForm.name.trim() || !activeWorkspaceId) return;

    try {
      const res = await chatService.createChannel(activeWorkspaceId, {
        name: newChannelForm.name.trim(),
        description: newChannelForm.description.trim(),
        isPrivate: newChannelForm.isPrivate,
      });

      const newChan = res.data;
      setChannels((prev) => [...prev, newChan]);
      setSelectedChat({ type: 'channel', data: newChan });
      setIsChannelModalOpen(false);
      setNewChannelForm({ name: '', description: '', isPrivate: false });
    } catch (err) {
      setErrorBanner(err.response?.data?.message || err.message || 'Failed to create channel.');
    }
  };

  // 13. Create New Direct Message Handler
  const handleCreateDirectMessage = async (e) => {
    e.preventDefault();
    if (!selectedRecipientId || !activeWorkspaceId) return;

    try {
      const res = await chatService.createConversation(activeWorkspaceId, {
        type: 'direct',
        participantIds: [parseInt(selectedRecipientId, 10)],
      });

      const conv = res.data;
      setConversations((prev) => {
        if (prev.some((c) => c._id === conv._id)) return prev;
        return [conv, ...prev];
      });
      setSelectedChat({ type: 'conversation', data: conv });
      setIsDirectModalOpen(false);
      setSelectedRecipientId('');
    } catch (err) {
      setErrorBanner(err.response?.data?.message || err.message || 'Failed to start conversation.');
    }
  };

  // Helper: Resolve Member Name by user ID
  const getMemberName = useCallback(
    (userId) => {
      if (currentUser && userId === currentUser.id) {
        return currentUser.name || 'You';
      }
      return membersMap[userId]?.name || `Member #${userId}`;
    },
    [currentUser, membersMap]
  );

  // Helper: Resolve Conversation Display Name
  const getConversationTitle = useCallback(
    (conv) => {
      if (!conv || !conv.participantIds) return 'Direct Message';
      const otherParticipantIds = conv.participantIds.filter((id) => !currentUser || id !== currentUser.id);
      if (otherParticipantIds.length === 0) return currentUser?.name || 'Direct Message';
      return otherParticipantIds.map((id) => getMemberName(id)).join(', ');
    },
    [currentUser, getMemberName]
  );

  // Filtered Channels & Conversations for search
  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) return channels;
    const q = searchQuery.toLowerCase();
    return channels.filter((c) => c.name.toLowerCase().includes(q) || (c.description && c.description.toLowerCase().includes(q)));
  }, [channels, searchQuery]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((conv) => getConversationTitle(conv).toLowerCase().includes(q));
  }, [conversations, searchQuery, getConversationTitle]);

  return (
    <div className="chat-layout-root">
      {/* Error Alert Banner */}
      {errorBanner && (
        <div className="chat-alert-banner">
          <span>{errorBanner}</span>
          <button type="button" onClick={() => setErrorBanner('')} className="chat-alert-close">
            ✕
          </button>
        </div>
      )}

      <div className="chat-container card">
        {/* Mobile View Toggle */}
        <div className="chat-mobile-toggle-bar">
          <Button
            size="sm"
            variant="neutral"
            onClick={() => setIsMobileSidebarOpen((prev) => !prev)}
          >
            {isMobileSidebarOpen ? '✕ Close Channels' : '💬 View Channels & DMs'}
          </Button>
        </div>

        {/* 1. CHAT SIDEBAR */}
        <aside className={`chat-sidebar ${isMobileSidebarOpen ? 'mobile-open' : ''}`}>
          {/* Workspace selector indicator */}
          <div className="chat-sidebar-header">
            <div className="chat-workspace-info">
              <span className="chat-workspace-avatar">
                {workspaces.find((w) => w.id === activeWorkspaceId)?.name?.[0] || 'N'}
              </span>
              <div className="chat-workspace-details">
                <h2 className="chat-workspace-title">
                  {workspaces.find((w) => w.id === activeWorkspaceId)?.name || 'Nexora Workspace'}
                </h2>
                <span className="chat-workspace-subtitle">Real-Time Team Chat</span>
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="chat-search-wrap">
            <input
              type="text"
              className="chat-search-input"
              placeholder="Search channels or people..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="chat-sidebar-scroll">
            {/* CHANNELS SECTION */}
            <div className="chat-section">
              <div className="chat-section-header">
                <span className="chat-section-title">CHANNELS</span>
                <button
                  type="button"
                  className="chat-section-add-btn"
                  title="Create Channel"
                  onClick={() => setIsChannelModalOpen(true)}
                >
                  +
                </button>
              </div>

              <div className="chat-section-items">
                {filteredChannels.length === 0 ? (
                  <div className="chat-sidebar-empty">
                    {searchQuery ? 'No matching channels' : 'No channels yet'}
                  </div>
                ) : (
                  filteredChannels.map((chan) => {
                    const isSelected = selectedChat?.type === 'channel' && selectedChat.data._id === chan._id;
                    return (
                      <button
                        key={chan._id}
                        type="button"
                        className={`chat-item-btn ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedChat({ type: 'channel', data: chan });
                          setIsMobileSidebarOpen(false);
                        }}
                      >
                        <span className="chat-channel-hash">{chan.isPrivate ? '🔒' : '#'}</span>
                        <span className="chat-item-label">{chan.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* DIRECT MESSAGES SECTION */}
            <div className="chat-section">
              <div className="chat-section-header">
                <span className="chat-section-title">DIRECT MESSAGES</span>
                <button
                  type="button"
                  className="chat-section-add-btn"
                  title="New Direct Message"
                  onClick={() => setIsDirectModalOpen(true)}
                >
                  +
                </button>
              </div>

              <div className="chat-section-items">
                {filteredConversations.length === 0 ? (
                  <div className="chat-sidebar-empty">
                    {searchQuery ? 'No matching conversations' : 'Start a conversation'}
                  </div>
                ) : (
                  filteredConversations.map((conv) => {
                    const isSelected = selectedChat?.type === 'conversation' && selectedChat.data._id === conv._id;
                    const title = getConversationTitle(conv);
                    return (
                      <button
                        key={conv._id}
                        type="button"
                        className={`chat-item-btn ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedChat({ type: 'conversation', data: conv });
                          setIsMobileSidebarOpen(false);
                        }}
                      >
                        <Avatar name={title} size="xs" />
                        <span className="chat-item-label">{title}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* 2. MAIN CHAT CONVERSATION AREA */}
        <section className="chat-main-area">
          {selectedChat ? (
            <>
              {/* CHAT HEADER */}
              <header className="chat-header">
                <div className="chat-header-title-block">
                  <div className="chat-header-primary">
                    <span className="chat-header-icon">
                      {selectedChat.type === 'channel' ? (selectedChat.data.isPrivate ? '🔒' : '#') : '👤'}
                    </span>
                    <h1 className="chat-header-name">
                      {selectedChat.type === 'channel'
                        ? selectedChat.data.name
                        : getConversationTitle(selectedChat.data)}
                    </h1>
                    <Badge variant={selectedChat.type === 'channel' ? 'primary' : 'neutral'}>
                      {selectedChat.type === 'channel'
                        ? selectedChat.data.isPrivate
                          ? 'Private Channel'
                          : 'Public Channel'
                        : selectedChat.data.type === 'group'
                        ? 'Group Chat'
                        : 'Direct Message'}
                    </Badge>
                  </div>
                  {selectedChat.data.description && (
                    <p className="chat-header-desc">{selectedChat.data.description}</p>
                  )}
                </div>
              </header>

              {/* MESSAGE LIST */}
              <div className="chat-message-list">
                {/* Pagination: Load older messages */}
                {pagination.hasMore && (
                  <div className="chat-load-older-container">
                    <Button
                      size="sm"
                      variant="neutral"
                      disabled={isLoadingOlder}
                      onClick={handleLoadOlderMessages}
                    >
                      {isLoadingOlder ? 'Loading earlier messages...' : '↑ Load older messages'}
                    </Button>
                  </div>
                )}

                {isLoadingMessages ? (
                  <div className="chat-loading-screen">
                    <div className="loading-spinner" />
                    <p>Loading messages...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="chat-empty-messages">
                    <span className="chat-empty-icon">💬</span>
                    <h3>No messages yet</h3>
                    <p>Start the conversation by sending a message below.</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMyMessage = currentUser && msg.senderId === currentUser.id;
                    const senderName = getMemberName(msg.senderId);
                    const formattedTime = new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={msg._id}
                        className={`chat-message-item ${isMyMessage ? 'is-self' : ''} ${
                          msg.deletedAt ? 'is-deleted' : ''
                        }`}
                      >
                        <Avatar name={senderName} size="sm" className="chat-msg-avatar" />

                        <div className="chat-msg-body">
                          <div className="chat-msg-meta">
                            <span className="chat-msg-sender">{senderName}</span>
                            <span className="chat-msg-time">{formattedTime}</span>
                            {msg.editedAt && !msg.deletedAt && (
                              <span className="chat-msg-edited" title={`Edited: ${new Date(msg.editedAt).toLocaleString()}`}>
                                (edited)
                              </span>
                            )}
                          </div>

                          {/* Message Content or Edit Input */}
                          {editingMessageId === msg._id ? (
                            <div className="chat-msg-edit-box">
                              <input
                                type="text"
                                className="chat-msg-edit-input"
                                value={editingContent}
                                onChange={(e) => setEditingContent(e.target.value)}
                                autoFocus
                              />
                              <div className="chat-msg-edit-actions">
                                <Button size="sm" variant="primary" onClick={() => handleSaveEdit(msg._id)}>
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="neutral"
                                  onClick={() => {
                                    setEditingMessageId(null);
                                    setEditingContent('');
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : msg.deletedAt ? (
                            <p className="chat-msg-deleted-text">This message was deleted.</p>
                          ) : (
                            <p className="chat-msg-content">{msg.content}</p>
                          )}

                          {/* Reactions Row & Actions */}
                          {!msg.deletedAt && editingMessageId !== msg._id && (
                            <div className="chat-msg-footer">
                              {/* Quick Reaction Buttons */}
                              <div className="chat-quick-reactions">
                                {['👍', '❤️', '🎉', '🚀'].map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className="chat-reaction-btn"
                                    onClick={() => handleToggleReaction(msg._id, emoji)}
                                    title={`React ${emoji}`}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>

                              {/* Thread Reply Link */}
                              <button
                                type="button"
                                className="chat-thread-btn"
                                onClick={() => handleOpenThread(msg)}
                              >
                                💬 Reply in thread
                              </button>

                              {/* Self Actions: Edit / Delete */}
                              {isMyMessage && (
                                <div className="chat-self-actions">
                                  <button
                                    type="button"
                                    className="chat-action-link"
                                    onClick={() => {
                                      setEditingMessageId(msg._id);
                                      setEditingContent(msg.content);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="chat-action-link delete"
                                    onClick={() => handleDeleteMessage(msg._id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* MESSAGE COMPOSER */}
              <form className="chat-composer" onSubmit={handleSendMessage}>
                <textarea
                  className="chat-composer-textarea"
                  placeholder={
                    selectedChat.type === 'channel'
                      ? `Message #${selectedChat.data.name}...`
                      : `Message ${getConversationTitle(selectedChat.data)}...`
                  }
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  rows={2}
                  disabled={isSending}
                />
                <div className="chat-composer-toolbar">
                  <span className="chat-composer-hint">Press Enter to send, Shift + Enter for new line</span>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={!messageInput.trim() || isSending}
                  >
                    {isSending ? 'Sending...' : 'Send Message'}
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="chat-no-selection">
              <span className="chat-no-selection-icon">💬</span>
              <h2>No conversation selected</h2>
              <p>Choose a channel or direct message from the left to start collaborating.</p>
            </div>
          )}
        </section>

        {/* 3. THREAD DRAWER (If active thread selected) */}
        {activeThreadRoot && (
          <aside className="chat-thread-drawer">
            <div className="chat-thread-header">
              <div className="chat-thread-title">
                <h3>Thread</h3>
                <span className="chat-thread-sub">Replying to message</span>
              </div>
              <button
                type="button"
                className="chat-thread-close-btn"
                onClick={() => setActiveThreadRoot(null)}
              >
                ✕
              </button>
            </div>

            {/* Root Message Box */}
            <div className="chat-thread-root-card">
              <div className="chat-msg-meta">
                <Avatar name={getMemberName(activeThreadRoot.senderId)} size="xs" />
                <span className="chat-msg-sender">{getMemberName(activeThreadRoot.senderId)}</span>
                <span className="chat-msg-time">
                  {new Date(activeThreadRoot.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="chat-thread-root-content">{activeThreadRoot.content}</p>
            </div>

            {/* Thread Replies List */}
            <div className="chat-thread-replies-list">
              {threadReplies.length === 0 ? (
                <div className="chat-thread-empty">No replies yet. Be the first to reply.</div>
              ) : (
                threadReplies.map((reply) => (
                  <div key={reply._id} className="chat-thread-reply-item">
                    <Avatar name={getMemberName(reply.senderId)} size="xs" />
                    <div className="chat-thread-reply-body">
                      <div className="chat-msg-meta">
                        <span className="chat-msg-sender">{getMemberName(reply.senderId)}</span>
                        <span className="chat-msg-time">
                          {new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="chat-thread-reply-text">{reply.content}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={threadEndRef} />
            </div>

            {/* Thread Reply Composer */}
            <form className="chat-thread-composer" onSubmit={handleSendThreadReply}>
              <input
                type="text"
                className="chat-thread-input"
                placeholder="Reply in thread..."
                value={threadReplyInput}
                onChange={(e) => setThreadReplyInput(e.target.value)}
                disabled={isSendingThreadReply}
              />
              <Button
                type="submit"
                size="sm"
                variant="primary"
                disabled={!threadReplyInput.trim() || isSendingThreadReply}
              >
                Reply
              </Button>
            </form>
          </aside>
        )}
      </div>

      {/* CREATE CHANNEL MODAL */}
      {isChannelModalOpen && (
        <div className="chat-modal-overlay">
          <div className="chat-modal card">
            <div className="chat-modal-header">
              <h2>Create Channel</h2>
              <button type="button" className="chat-modal-close" onClick={() => setIsChannelModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateChannel} className="chat-modal-form">
              <div className="form-group">
                <label className="form-label" htmlFor="new-channel-name">Channel Name *</label>
                <input
                  id="new-channel-name"
                  type="text"
                  className="input"
                  placeholder="e.g. design-updates"
                  value={newChannelForm.name}
                  onChange={(e) => setNewChannelForm({ ...newChannelForm, name: e.target.value })}
                  required
                />
                <span className="form-hint">Lowercase letters, numbers, hyphens and underscores only.</span>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="new-channel-desc">Description</label>
                <input
                  id="new-channel-desc"
                  type="text"
                  className="input"
                  placeholder="What is this channel about?"
                  value={newChannelForm.description}
                  onChange={(e) => setNewChannelForm({ ...newChannelForm, description: e.target.value })}
                />
              </div>

              <div className="form-group-checkbox">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newChannelForm.isPrivate}
                    onChange={(e) => setNewChannelForm({ ...newChannelForm, isPrivate: e.target.checked })}
                  />
                  <span>Make channel private</span>
                </label>
              </div>

              <div className="chat-modal-actions">
                <Button type="button" variant="neutral" onClick={() => setIsChannelModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={!newChannelForm.name.trim()}>
                  Create Channel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW DIRECT MESSAGE MODAL */}
      {isDirectModalOpen && (
        <div className="chat-modal-overlay">
          <div className="chat-modal card">
            <div className="chat-modal-header">
              <h2>New Direct Message</h2>
              <button type="button" className="chat-modal-close" onClick={() => setIsDirectModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateDirectMessage} className="chat-modal-form">
              <div className="form-group">
                <label className="form-label" htmlFor="recipient-select">Select Teammate *</label>
                <select
                  id="recipient-select"
                  className="input"
                  value={selectedRecipientId}
                  onChange={(e) => setSelectedRecipientId(e.target.value)}
                  required
                >
                  <option value="">-- Choose a workspace member --</option>
                  {workspaceMembersList
                    .filter((m) => {
                      const uId = m.user_id || m.user?.id || m.id;
                      return !currentUser || uId !== currentUser.id;
                    })
                    .map((m) => {
                      const uId = m.user_id || m.user?.id || m.id;
                      const name = m.user?.name || m.name || `Member #${uId}`;
                      return (
                        <option key={uId} value={uId}>
                          {name}
                        </option>
                      );
                    })}
                </select>
              </div>

              <div className="chat-modal-actions">
                <Button type="button" variant="neutral" onClick={() => setIsDirectModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={!selectedRecipientId}>
                  Start Chat
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;
