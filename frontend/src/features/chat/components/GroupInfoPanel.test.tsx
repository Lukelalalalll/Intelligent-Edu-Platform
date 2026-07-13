import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GroupInfoPanel from './GroupInfoPanel';
import type { ChatContact, ChatRoom } from '../types';

const chatApiMocks = vi.hoisted(() => ({
    getRoomInfo: vi.fn(),
    kickRoomMember: vi.fn(),
    addRoomMember: vi.fn(),
    leaveRoom: vi.fn(),
    deleteRoom: vi.fn(),
    sendFriendRequest: vi.fn(),
}));

const mockStoreState = vi.hoisted(() => ({
    contacts: [] as ChatContact[],
    user: { id: 'user-1', username: 'alex' } as { id: string; username: string } | null,
}));

vi.mock('../api', () => ({
    chatApi: chatApiMocks,
}));

vi.mock('../store/chatStore', () => ({
    useChatStore: (selector: (state: { contacts: ChatContact[] }) => unknown) =>
        selector({ contacts: mockStoreState.contacts }),
}));

vi.mock('@/shared/store/useAuthStore', () => ({
    useAuthStore: (selector: (state: { user: { id: string; username: string } | null }) => unknown) =>
        selector({ user: mockStoreState.user }),
}));

function createContact(overrides: Partial<ChatContact>): ChatContact {
    return {
        id: 'contact-1',
        username: 'alex',
        email: 'alex@example.com',
        role: 'student',
        ...overrides,
    };
}

function createRoom(overrides: Partial<ChatRoom>): ChatRoom {
    return {
        id: 'room-1',
        type: 'group',
        name: 'Study Group',
        members: ['user-1', 'user-2'],
        createdBy: 'user-1',
        avatarColor: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        lastMessage: null,
        ...overrides,
    };
}

function renderPanel(options?: {
    room?: ChatRoom;
    members?: ChatContact[];
    isOwner?: boolean;
    visible?: boolean;
    onClose?: () => void;
    onLeaveOrDelete?: () => void;
}) {
    const room = options?.room ?? createRoom({});
    const members = options?.members ?? [
        createContact({ id: 'user-1', username: 'alex' }),
        createContact({ id: 'user-2', username: 'blair', role: 'teacher' }),
    ];
    const isOwner = options?.isOwner ?? false;
    const visible = options?.visible ?? true;
    const onClose = options?.onClose ?? vi.fn();
    const onLeaveOrDelete = options?.onLeaveOrDelete ?? vi.fn();

    chatApiMocks.getRoomInfo.mockResolvedValue({
        ok: true,
        room,
        members,
        isOwner,
    });

    const view = render(
        <GroupInfoPanel
            roomId={room.id}
            visible={visible}
            onClose={onClose}
            onLeaveOrDelete={onLeaveOrDelete}
        />,
    );

    return {
        ...view,
        room,
        members,
        onClose,
        onLeaveOrDelete,
    };
}

function getMemberAvatar(name: string): HTMLElement {
    const nameNode = screen.getByText(name);
    const infoContainer = nameNode.closest('div');

    if (!(infoContainer?.previousElementSibling instanceof HTMLElement)) {
        throw new Error(`Could not find avatar for ${name}`);
    }

    return infoContainer.previousElementSibling;
}

function getSelfAvatar(): HTMLElement {
    const youTag = screen.getByText(/\(You\)/);
    const infoContainer = youTag.closest('div');

    if (!(infoContainer?.previousElementSibling instanceof HTMLElement)) {
        throw new Error('Could not find self avatar');
    }

    return infoContainer.previousElementSibling;
}

describe('GroupInfoPanel', () => {
    beforeEach(() => {
        chatApiMocks.getRoomInfo.mockReset();
        chatApiMocks.kickRoomMember.mockReset();
        chatApiMocks.addRoomMember.mockReset();
        chatApiMocks.leaveRoom.mockReset();
        chatApiMocks.deleteRoom.mockReset();
        chatApiMocks.sendFriendRequest.mockReset();

        chatApiMocks.kickRoomMember.mockResolvedValue({ ok: true });
        chatApiMocks.addRoomMember.mockResolvedValue({ ok: true });
        chatApiMocks.leaveRoom.mockResolvedValue({ ok: true });
        chatApiMocks.deleteRoom.mockResolvedValue({ ok: true });
        chatApiMocks.sendFriendRequest.mockResolvedValue({ ok: true });

        mockStoreState.contacts = [];
        mockStoreState.user = { id: 'user-1', username: 'alex' };

        vi.restoreAllMocks();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
    });

    it('renders nothing while hidden, then loads room info when shown', async () => {
        const room = createRoom({});
        const members = [
            createContact({ id: 'user-1', username: 'alex' }),
            createContact({ id: 'user-2', username: 'blair' }),
        ];
        const onLeaveOrDelete = vi.fn();

        const { rerender } = render(
            <GroupInfoPanel
                roomId={room.id}
                visible={false}
                onClose={vi.fn()}
                onLeaveOrDelete={onLeaveOrDelete}
            />,
        );

        expect(screen.queryByText('Group Info')).not.toBeInTheDocument();
        expect(chatApiMocks.getRoomInfo).not.toHaveBeenCalled();

        chatApiMocks.getRoomInfo.mockResolvedValue({
            ok: true,
            room,
            members,
            isOwner: false,
        });

        rerender(
            <GroupInfoPanel
                roomId={room.id}
                visible
                onClose={vi.fn()}
                onLeaveOrDelete={onLeaveOrDelete}
            />,
        );

        expect(await screen.findByText('Study Group')).toBeInTheDocument();
        expect(chatApiMocks.getRoomInfo).toHaveBeenCalledWith(room.id);
    });

    it('reloads room info when the matching room update event fires', async () => {
        const room = createRoom({});

        renderPanel({ room });

        await screen.findByText('Study Group');
        expect(chatApiMocks.getRoomInfo).toHaveBeenCalledTimes(1);

        act(() => {
            window.dispatchEvent(
                new CustomEvent('chat_room_updated', { detail: { roomId: room.id } }),
            );
        });

        await waitFor(() => {
            expect(chatApiMocks.getRoomInfo).toHaveBeenCalledTimes(2);
        });
    });

    it('shows owner-only controls for group owners, including add member and popup kick', async () => {
        const user = userEvent.setup();
        const room = createRoom({ createdBy: 'user-1' });
        const members = [
            createContact({ id: 'user-1', username: 'alex', role: 'teacher' }),
            createContact({ id: 'user-2', username: 'blair', role: 'student' }),
            createContact({ id: 'user-3', username: 'casey', role: 'student' }),
        ];

        mockStoreState.contacts = [
            ...members,
            createContact({ id: 'user-4', username: 'drew', role: 'student' }),
        ];

        renderPanel({ room, members, isOwner: true });

        await screen.findByText('Study Group');

        expect(screen.getByText('Owner')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Add Member/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Leave Group/i })).not.toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: /Remove .* from group/i })).toHaveLength(2);

        await user.click(getMemberAvatar('blair'));

        expect(screen.getByRole('button', { name: /^Remove from group$/i })).toBeInTheDocument();
    });

    it('shows leave for non-owners and keeps owner-only controls hidden', async () => {
        const user = userEvent.setup();
        const onLeaveOrDelete = vi.fn();
        const room = createRoom({ createdBy: 'user-1' });
        const members = [
            createContact({ id: 'user-1', username: 'alex', role: 'teacher' }),
            createContact({ id: 'user-2', username: 'blair', role: 'student' }),
        ];

        mockStoreState.user = { id: 'user-2', username: 'blair' };

        renderPanel({ room, members, isOwner: false, onLeaveOrDelete });

        await screen.findByText('Study Group');

        expect(screen.getByRole('button', { name: /Leave Group/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Add Member/i })).not.toBeInTheDocument();
        expect(screen.queryByText('Owner')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Remove .* from group/i })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Leave Group/i }));

        await waitFor(() => {
            expect(chatApiMocks.leaveRoom).toHaveBeenCalledWith(room.id);
            expect(onLeaveOrDelete).toHaveBeenCalledTimes(1);
        });
    });

    it('shows direct chat info and still deletes the conversation', async () => {
        const user = userEvent.setup();
        const onLeaveOrDelete = vi.fn();
        const room = createRoom({
            type: 'direct',
            name: 'Direct Chat',
            createdBy: 'user-2',
        });
        const members = [
            createContact({ id: 'user-1', username: 'alex' }),
            createContact({ id: 'user-2', username: 'drew', role: 'teacher' }),
        ];

        renderPanel({ room, members, isOwner: false, onLeaveOrDelete });

        await screen.findByText('Direct Chat');

        expect(screen.getByText('Chat Info')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Add Member/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Leave Group/i })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Delete Chat/i }));

        await waitFor(() => {
            expect(window.confirm).toHaveBeenCalledWith(
                'Delete this conversation? It will be hidden from your chat list.',
            );
            expect(chatApiMocks.deleteRoom).toHaveBeenCalledWith(room.id);
            expect(onLeaveOrDelete).toHaveBeenCalledTimes(1);
        });
    });

    it('does not open a popup for self, but lets you add a friend from another member popup', async () => {
        const user = userEvent.setup();
        const room = createRoom({ createdBy: 'user-1' });
        const members = [
            createContact({ id: 'user-1', username: 'alex', role: 'teacher' }),
            createContact({ id: 'user-2', username: 'blair', role: 'student' }),
        ];

        renderPanel({ room, members, isOwner: false });

        await screen.findByText('Study Group');

        await user.click(getSelfAvatar());
        expect(screen.queryByRole('button', { name: /^Add Friend$/i })).not.toBeInTheDocument();

        await user.click(getMemberAvatar('blair'));
        expect(screen.getByRole('button', { name: /^Add Friend$/i })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /^Add Friend$/i }));

        await waitFor(() => {
            expect(chatApiMocks.sendFriendRequest).toHaveBeenCalledWith('blair');
            expect(screen.getByText('Request sent')).toBeInTheDocument();
        });
    });

    it('never shows the popup kick action for the room owner branch', async () => {
        const user = userEvent.setup();
        const room = createRoom({ createdBy: 'user-2' });
        const members = [
            createContact({ id: 'user-1', username: 'alex', role: 'teacher' }),
            createContact({ id: 'user-2', username: 'blair', role: 'student' }),
        ];

        renderPanel({ room, members, isOwner: true });

        await screen.findByText('Study Group');
        await user.click(getMemberAvatar('blair'));

        expect(screen.queryByRole('button', { name: /^Remove from group$/i })).not.toBeInTheDocument();
    });
});
