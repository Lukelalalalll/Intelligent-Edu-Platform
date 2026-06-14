// frontend/src/features/chat/pages/ChatPage.tsx

import React, { Suspense, lazy, useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import ContactList from '../components/ContactList';
import ChatWindow from '../components/ChatWindow';
import { useChatRooms } from '../hooks/useChatRooms';
import { useChatWebSocket } from '../hooks/useChatWebSocket';
import { useChatStore } from '../store/chatStore';
import { chatApi } from '../api';
import globalStyles from '../styles/globals.module.css';
import layoutStyles from '../styles/components/ChatLayout.module.css';
import messageListStyles from '../styles/components/MessageList.module.css';

const styles = {
    ...globalStyles,
    ...layoutStyles,
    ...messageListStyles,
};

const AddFriendModal = lazy(() => import('../components/AddFriendModal'));
const CreateGroupModal = lazy(() => import('../components/CreateGroupModal'));
const CreateCourseGroupModal = lazy(() => import('../components/CreateCourseGroupModal'));
const FriendRequestsPanel = lazy(() => import('../components/FriendRequestsPanel'));

export type LeftPaneTab = 'chats' | 'contacts';

export default function ChatPage() {
    const { roomId } = useParams<{ roomId?: string }>();
    const navigate = useNavigate();
    // Fine-grained selectors: ChatPage only re-renders when activeRoomId changes,
    // not on every incoming WebSocket message (appendMessage / incrementUnread / etc.)
    const activeRoomId = useChatStore((s) => s.activeRoomId);
    const setActiveRoom = useChatStore((s) => s.setActiveRoom);
    const setContacts = useChatStore((s) => s.setContacts);
    const setPendingRequests = useChatStore((s) => s.setPendingRequests);

    useChatWebSocket(true);
    useChatRooms(true);

    const [showAddFriend, setShowAddFriend] = useState(false);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [showCourseGroup, setShowCourseGroup] = useState(false);
    const [showRequests, setShowRequests] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [leftTab, setLeftTab] = useState<LeftPaneTab>('chats');

    // Make the left pane resizable
    const [leftPaneWidth, setLeftPaneWidth] = useState(300);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDraggingRef.current = true;
        setIsDragging(true);

        const handleMouseMove = (ev: MouseEvent) => {
            if (!isDraggingRef.current || !containerRef.current) return;
            const containerRect = containerRef.current.getBoundingClientRect();
            const newWidth = ev.clientX - containerRect.left;
            if (newWidth >= 200 && newWidth <= 600) {
                setLeftPaneWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            isDraggingRef.current = false;
            setIsDragging(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, []);

    // Sync URL param to store
    useEffect(() => {
        if (roomId && roomId !== activeRoomId) {
            setActiveRoom(roomId);
            return;
        }
        // Entering /chat (without /room/:id) should not auto-open any room.
        if (!roomId && activeRoomId) {
            setActiveRoom(null);
        }
    }, [roomId, activeRoomId, setActiveRoom]);

    // Load contacts + requests on mount
    useEffect(() => {
        chatApi.getContacts().then(r => setContacts(r.contacts)).catch(() => {});
        chatApi.getFriendRequests().then(r => setPendingRequests(r.requests)).catch(() => {});
    }, [setContacts, setPendingRequests]);

    const handleSelectRoom = useCallback((id: string) => {
        setActiveRoom(id);
        navigate(`/chat/room/${id}`);
    }, [setActiveRoom, navigate]);

    const handleOpenDirect = useCallback(async (contactId: string) => {
        try {
            const res = await chatApi.createOrGetDirectRoom(contactId);
            setLeftTab('chats');
            handleSelectRoom(res.roomId);
        } catch {
            // ignore
        }
    }, [handleSelectRoom]);

    const handleAcceptedFriend = useCallback(async (friendUserId: string) => {
        try {
            const res = await chatApi.createOrGetDirectRoom(friendUserId);
            setShowRequests(false);
            setLeftTab('chats');
            handleSelectRoom(res.roomId);
        } catch {
            // ignore
        }
    }, [handleSelectRoom]);

    return (
        <div
            className={`global-chat-wrapper ${styles.chatWorkspace} ${styles.enterAnimation}`}
            ref={containerRef}
            style={{
                '--left-pane-width': `${leftPaneWidth}px`,
                cursor: isDragging ? 'col-resize' : 'default'
            } as React.CSSProperties}
        >
            <div className={`${styles.chatContainer} ${isDragging ? styles.dragging : ''}`}>
                <div
                    className={styles.leftPaneWrapper}
                    style={{ flex: `0 0 ${leftPaneWidth}px`, display: 'flex' }}
                >
                    <ContactList
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                        onSelectRoom={handleSelectRoom}
                        onOpenDirect={handleOpenDirect}
                        onAddFriend={() => setShowAddFriend(true)}
                        onCreateGroup={() => setShowCreateGroup(true)}
                        onCreateCourseGroup={() => setShowCourseGroup(true)}
                        onShowRequests={() => setShowRequests(true)}
                        activeTab={leftTab}
                        onTabChange={setLeftTab}
                    />
                </div>

                {/* Resizer */}
                <div
                    className={`${styles.resizer} ${isDragging ? styles.resizerDragging : ''}`}
                    onMouseDown={handleMouseDown}
                />

                <div className={styles.rightPane}>
                    {activeRoomId ? (
                        <ChatWindow roomId={activeRoomId} />
                    ) : (
                        <div className={styles.rightPaneEmpty}>
                            <i className={`fas fa-comments ${styles.rightPaneEmptyIcon}`} />
                            <span className={styles.rightPaneEmptyText}>Select a conversation to start chatting</span>
                        </div>
                    )}
                </div>
            </div>

            <Suspense fallback={null}>
                <AnimatePresence>
                    {showAddFriend && <AddFriendModal key="add-friend" onClose={() => setShowAddFriend(false)} />}
                    {showCreateGroup && (
                        <CreateGroupModal
                            key="create-group"
                            onClose={() => setShowCreateGroup(false)}
                            onCreated={(newRoomId) => {
                                setShowCreateGroup(false);
                                handleSelectRoom(newRoomId);
                            }}
                        />
                    )}
                    {showCourseGroup && (
                        <CreateCourseGroupModal
                            key="course-group"
                            onClose={() => setShowCourseGroup(false)}
                            onEnterRoom={(id) => {
                                setShowCourseGroup(false);
                                handleSelectRoom(id);
                            }}
                        />
                    )}
                </AnimatePresence>
            </Suspense>

            <Suspense fallback={null}>
                {showRequests && (
                    <FriendRequestsPanel
                        onClose={() => setShowRequests(false)}
                        onAccepted={handleAcceptedFriend}
                    />
                )}
            </Suspense>
        </div>
    );
}
