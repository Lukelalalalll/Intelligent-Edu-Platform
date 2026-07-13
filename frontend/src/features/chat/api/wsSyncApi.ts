import { contactApi } from './contactApi';
import { messageApi } from './messageApi';
import { roomApi } from './roomApi';

export async function fetchRoomsAndUnreadCounts() {
    const response = await roomApi.getRooms();
    const counts: Record<string, number> = {};

    for (const room of response.rooms) {
        counts[room.id] = (room as { unreadCount?: number }).unreadCount ?? 0;
    }

    return { rooms: response.rooms, counts };
}

export async function fetchRoomMessages(roomId: string) {
    return messageApi.getMessages(roomId);
}

export async function fetchFriendRequests() {
    return contactApi.getFriendRequests();
}

export async function fetchContacts() {
    return contactApi.getContacts();
}
