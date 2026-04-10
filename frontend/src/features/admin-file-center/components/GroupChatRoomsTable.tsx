import React from 'react';
import type { ChatRoomAssetSummary } from '../../../api/fileCenterApi';
import styles from '../styles/AdminFileCenter.module.css';

type Props = {
    busy: boolean;
    chatRooms: ChatRoomAssetSummary[];
    onOpenRoom: (room: ChatRoomAssetSummary) => void;
};

export default function GroupChatRoomsTable({ busy, chatRooms, onOpenRoom }: Props) {
    return (
        <div className={styles.tableWrap}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Group Name</th>
                        <th>Members</th>
                        <th>Course</th>
                        <th>Files</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {busy ? (
                        <tr><td colSpan={5}>Loading...</td></tr>
                    ) : chatRooms.length === 0 ? (
                        <tr><td colSpan={5}>No group chat rooms found.</td></tr>
                    ) : chatRooms.map((room) => (
                        <tr key={room.room_id}>
                            <td>{room.name || room.room_id}</td>
                            <td>{room.member_count}</td>
                            <td>{room.course_id || '-'}</td>
                            <td>{room.asset_count}</td>
                            <td>
                                <button className={`${styles.btn} ${styles.btnSmall}`} type="button" onClick={() => onOpenRoom(room)}>
                                    Open
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
