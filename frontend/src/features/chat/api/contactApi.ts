import client from '../../../api/client';
import type { ChatContact, FriendRequest, CourseInfo } from '../types';

export const contactApi = {
    getContacts: (): Promise<{ contacts: ChatContact[] }> =>
        client.get('/chat/contacts').then(r => r.data),

    sendFriendRequest: (targetUsername: string) =>
        client.post('/chat/contacts/request', { targetUsername }).then(r => r.data),

    getFriendRequests: (): Promise<{ requests: FriendRequest[] }> =>
        client.get('/chat/contacts/requests').then(r => r.data),

    acceptFriendRequest: (contactId: string) =>
        client.post(`/chat/contacts/${contactId}/accept`).then(r => r.data),

    deleteContact: (contactId: string) =>
        client.delete(`/chat/contacts/${contactId}`).then(r => r.data),

    searchUsers: (q: string): Promise<{ users: ChatContact[] }> =>
        client.get('/chat/users/search', { params: { q } }).then(r => r.data),

    getCourseList: (): Promise<{ courses: CourseInfo[] }> =>
        client.get('/chat/rooms/from-course/list').then(r => r.data),
};
