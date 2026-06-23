import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../types';
import MessageBubble from '../MessageBubble';

const mocks = vi.hoisted(() => ({
    storeRecallMessage: vi.fn(),
    clipboardWriteText: vi.fn(),
    fetchFileBlob: vi.fn(),
    recallMessage: vi.fn(),
    toAbsoluteFileUrl: vi.fn((fileUrl: string) => {
        if (!fileUrl) return '';
        return fileUrl.startsWith('http') ? fileUrl : `https://files.test${fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`}`;
    }),
    createObjectURL: vi.fn(() => 'blob:download-url'),
    revokeObjectURL: vi.fn(),
}));

vi.mock('../../api', () => ({
    chatApi: {
        fetchFileBlob: mocks.fetchFileBlob,
        recallMessage: mocks.recallMessage,
        toAbsoluteFileUrl: mocks.toAbsoluteFileUrl,
        translateMessage: vi.fn(),
    },
}));

vi.mock('../../store/chatStore', () => ({
    useChatStore: (selector: (store: { recallMessage: typeof mocks.storeRecallMessage }) => unknown) =>
        selector({ recallMessage: mocks.storeRecallMessage }),
}));

vi.mock('../MessageContextMenu', () => ({
    default: ({
        canRecall,
        onCopy,
        onQuote,
        onRecall,
        onMultiSelect,
    }: {
        canRecall: boolean;
        onCopy: () => void;
        onQuote: () => void;
        onRecall: () => void;
        onMultiSelect: () => void;
    }) => (
        <div data-testid="message-context-menu">
            <button onClick={onCopy}>Copy</button>
            <button onClick={onQuote}>Quote</button>
            <button onClick={onMultiSelect}>Select</button>
            {canRecall && <button onClick={onRecall}>Recall</button>}
        </div>
    ),
}));

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
    return {
        id: 'msg-1',
        roomId: 'room-1',
        senderId: 'user-2',
        senderName: 'Alice',
        content: 'Hello world',
        type: 'text',
        messageType: 'text',
        recalled: false,
        failed: false,
        fileUrl: '',
        fileName: '',
        fileSize: undefined,
        mimeType: '',
        replyTo: null,
        forwardedFrom: null,
        readBy: [],
        sentAt: '2026-06-23T10:00:00.000Z',
        ...overrides,
    };
}

function renderMessageBubble(overrides: Partial<ComponentProps<typeof MessageBubble>> = {}) {
    const props: ComponentProps<typeof MessageBubble> = {
        message: makeMessage(),
        isOwn: false,
        showSender: false,
        multiSelect: false,
        selected: false,
        onToggleSelect: vi.fn(),
        onQuote: vi.fn(),
        onEnterMultiSelect: vi.fn(),
        onTransfer: undefined,
        ...overrides,
    };

    return {
        ...render(<MessageBubble {...props} />),
        props,
    };
}

describe('MessageBubble', () => {
    const fixedNow = new Date('2026-06-23T10:01:00.000Z').getTime();
    const realCreateElement = document.createElement.bind(document);
    let createdAnchors: HTMLAnchorElement[] = [];

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

        mocks.fetchFileBlob.mockResolvedValue(new Blob(['file-bytes'], { type: 'application/octet-stream' }));
        mocks.recallMessage.mockResolvedValue({ ok: true });
        mocks.clipboardWriteText.mockResolvedValue(undefined);

        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: mocks.clipboardWriteText },
        });

        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            writable: true,
            value: mocks.createObjectURL,
        });

        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            writable: true,
            value: mocks.revokeObjectURL,
        });

        createdAnchors = [];
        vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
            const element = realCreateElement(tagName);
            if (tagName.toLowerCase() === 'a') {
                element.click = vi.fn();
                createdAnchors.push(element as HTMLAnchorElement);
            }
            return element;
        }) as typeof document.createElement);
    });

    it('renders system messages without the standard bubble actions', () => {
        renderMessageBubble({
            multiSelect: true,
            message: makeMessage({
                type: 'system',
                content: 'Room settings updated',
            }),
        });

        expect(screen.getByText('Room settings updated')).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(screen.queryByTitle('Recall message')).not.toBeInTheDocument();
    });

    it('renders recalled messages for self and others without interactive controls', () => {
        const { rerender, props } = renderMessageBubble({
            isOwn: true,
            multiSelect: true,
            message: makeMessage({
                recalled: true,
            }),
        });

        expect(screen.getByText('You recalled this message')).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

        rerender(
            <MessageBubble
                {...props}
                isOwn={false}
                message={makeMessage({
                    id: 'msg-2',
                    recalled: true,
                    senderName: 'Bob',
                })}
            />,
        );

        expect(screen.getByText('Bob recalled a message')).toBeInTheDocument();
        expect(screen.queryByTitle('Recall message')).not.toBeInTheDocument();
    });

    it('renders sender, forwarded label, reply snippet, content, and time for group text messages', () => {
        const message = makeMessage({
            senderName: 'Teacher Lin',
            content: 'Remember the reading for tomorrow.',
            forwardedFrom: 'Study Group',
            replyTo: {
                id: 'reply-1',
                senderName: 'Nina',
                content: 'Can we review chapter 4 first?',
            },
        });

        renderMessageBubble({
            message,
            isOwn: false,
            showSender: true,
        });

        expect(screen.getByText('Teacher Lin')).toBeInTheDocument();
        expect(screen.getByText('Forwarded from Study Group')).toBeInTheDocument();
        expect(screen.getByText('Nina')).toBeInTheDocument();
        expect(screen.getByText('Can we review chapter 4 first?')).toBeInTheDocument();
        expect(screen.getByText('Remember the reading for tomorrow.')).toBeInTheDocument();
        expect(screen.getByText(new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))).toBeInTheDocument();
    });

    it('downloads image attachments through the blob fetch path', async () => {
        const user = userEvent.setup();
        const message = makeMessage({
            id: 'file-msg',
            messageType: 'file',
            fileName: 'diagram.png',
            fileUrl: '/uploads/diagram.png',
            mimeType: 'image/png',
            content: '',
        });

        renderMessageBubble({ message });

        await user.click(screen.getByTitle('Download'));

        await waitFor(() => {
            expect(mocks.fetchFileBlob).toHaveBeenCalledWith('https://files.test/uploads/diagram.png');
        });

        const downloadAnchor = createdAnchors.find((anchor) => anchor.download === 'diagram.png');
        expect(mocks.createObjectURL).toHaveBeenCalled();
        expect(downloadAnchor).toBeDefined();
        expect(downloadAnchor?.href).toBe('blob:download-url');
        expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:download-url');
    });

    it('shows Transfer only for eligible persisted file messages', async () => {
        const user = userEvent.setup();
        const onTransfer = vi.fn();
        const eligibleMessage = makeMessage({
            id: 'file-transfer',
            messageType: 'file',
            fileName: 'notes.pdf',
            fileUrl: '/uploads/notes.pdf',
            mimeType: 'application/pdf',
            fileSize: 4096,
            content: '',
        });

        const { rerender, props } = renderMessageBubble({
            message: eligibleMessage,
            onTransfer,
        });

        expect(screen.getByText('Transfer')).toBeInTheDocument();
        await user.click(screen.getByText('Transfer'));
        expect(onTransfer).toHaveBeenCalledWith(eligibleMessage);

        rerender(<MessageBubble {...props} message={{ ...eligibleMessage, id: 'optimistic-1' }} onTransfer={onTransfer} />);
        expect(screen.queryByText('Transfer')).not.toBeInTheDocument();

        rerender(<MessageBubble {...props} message={{ ...eligibleMessage, id: 'file-failed', failed: true }} onTransfer={onTransfer} />);
        expect(screen.queryByText('Transfer')).not.toBeInTheDocument();

        rerender(<MessageBubble {...props} message={eligibleMessage} multiSelect onTransfer={onTransfer} />);
        expect(screen.queryByText('Transfer')).not.toBeInTheDocument();
    });

    it('toggles multi-select from row clicks and checkbox clicks only for regular messages', async () => {
        const user = userEvent.setup();
        const onToggleSelect = vi.fn();
        const message = makeMessage({ id: 'multi-1' });

        const { rerender, props } = renderMessageBubble({
            message,
            multiSelect: true,
            onToggleSelect,
        });

        await user.click(screen.getByText('Hello world'));
        expect(onToggleSelect).toHaveBeenCalledWith('multi-1');

        await user.click(screen.getByRole('checkbox'));
        expect(onToggleSelect).toHaveBeenCalledTimes(2);

        rerender(
            <MessageBubble
                {...props}
                multiSelect
                message={makeMessage({
                    id: 'system-blocked',
                    type: 'system',
                    content: 'System note',
                })}
                onToggleSelect={onToggleSelect}
            />,
        );

        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

        rerender(
            <MessageBubble
                {...props}
                multiSelect
                message={makeMessage({
                    id: 'recalled-blocked',
                    recalled: true,
                })}
                onToggleSelect={onToggleSelect}
            />,
        );

        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('shows the hover recall button for recent own messages and recalls through the store', async () => {
        const user = userEvent.setup({ writeToClipboard: false });
        const message = makeMessage({
            id: 'own-recent',
            roomId: 'room-own',
            senderId: 'user-1',
            content: 'Need to retract this.',
            sentAt: '2026-06-23T10:00:30.000Z',
        });

        renderMessageBubble({
            message,
            isOwn: true,
        });

        const messageBubble = screen.getByText('Need to retract this.').parentElement?.parentElement as HTMLElement;
        await user.hover(messageBubble);
        fireEvent.click(await screen.findByTitle('Recall message'));

        await waitFor(() => {
            expect(mocks.recallMessage).toHaveBeenCalledWith('own-recent');
        });
        expect(mocks.storeRecallMessage).toHaveBeenCalledWith('room-own', 'own-recent');
    });

    it('opens the context menu from both click and right-click and wires copy, quote, select, and recall actions', async () => {
        const onQuote = vi.fn();
        const onEnterMultiSelect = vi.fn();
        const message = makeMessage({
            id: 'menu-msg',
            roomId: 'room-menu',
            senderId: 'user-1',
            content: 'Context actions here',
            sentAt: '2026-06-23T10:00:30.000Z',
        });

        renderMessageBubble({
            message,
            isOwn: true,
            onQuote,
            onEnterMultiSelect,
        });

        const messageBubble = screen.getByText('Context actions here').parentElement?.parentElement as HTMLElement;

        fireEvent.contextMenu(messageBubble);
        expect(screen.getByTestId('message-context-menu')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
        expect(mocks.clipboardWriteText).toHaveBeenCalledWith('Context actions here');

        fireEvent.click(screen.getByText('Context actions here'));
        fireEvent.click(screen.getByRole('button', { name: 'Quote' }));
        expect(onQuote).toHaveBeenCalledWith(message);

        fireEvent.click(screen.getByText('Context actions here'));
        fireEvent.click(screen.getByRole('button', { name: 'Select' }));
        expect(onEnterMultiSelect).toHaveBeenCalledWith('menu-msg');

        fireEvent.click(screen.getByText('Context actions here'));
        fireEvent.click(screen.getByRole('button', { name: 'Recall' }));

        await waitFor(() => {
            expect(mocks.recallMessage).toHaveBeenCalledWith('menu-msg');
        });
        expect(mocks.storeRecallMessage).toHaveBeenCalledWith('room-menu', 'menu-msg');
    });
});
