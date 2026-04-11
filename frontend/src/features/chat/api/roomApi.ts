import client from '../../../api/client';
import type { ChatRoom, ChatContact } from '../types';

export const roomApi = {
    getRooms: (): Promise<{ rooms: ChatRoom[] }> =>
        client.get('/chat/rooms').then(r => r.data),

    createGroupRoom: (name: string, memberIds: string[]) =>
        client.post('/chat/rooms', { name, memberIds }).then(r => r.data),

    createOrGetDirectRoom: (targetUserId: string): Promise<{ ok: boolean; roomId: string }> =>
        client.post('/chat/rooms/direct', { targetUserId }).then(r => r.data),

    createCourseGroup: (courseId: string): Promise<{ ok: boolean; roomId: string }> =>
        client.post('/chat/rooms/from-course', { courseId }).then(r => r.data),

    getRoomInfo: (roomId: string): Promise<{
        ok: boolean;
        room: ChatRoom;
        members: ChatContact[];
        isOwner: boolean;
    }> => client.get(`/chat/rooms/${roomId}/info`).then(r => r.data),

    addRoomMember: (roomId: string, userId: string): Promise<{ ok: boolean }> =>
        client.post(`/chat/rooms/${roomId}/members/add`, { userId }).then(r => r.data),

    kickRoomMember: (roomId: string, userId: string): Promise<{ ok: boolean }> =>
        client.post(`/chat/rooms/${roomId}/members/kick`, { userId }).then(r => r.data),

    leaveRoom: (roomId: string): Promise<{ ok: boolean }> =>
        client.post(`/chat/rooms/${roomId}/leave`).then(r => r.data),

    deleteRoom: (roomId: string): Promise<{ ok: boolean }> =>
        client.delete(`/chat/rooms/${roomId}`).then(r => r.data),
};
