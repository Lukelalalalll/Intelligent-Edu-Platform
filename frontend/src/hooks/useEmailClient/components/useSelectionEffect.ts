import { useEffect } from 'react';

export function useSelectionEffect({
    selectedEmailId,
    setSelectedEmailDetail,
    setEmailClassification,
    setIsReplying,
    setReplyBody,
    loadEmailDetail,
}: {
    selectedEmailId: string;
    setSelectedEmailDetail: (value: any) => void;
    setEmailClassification: (value: any) => void;
    setIsReplying: (value: boolean) => void;
    setReplyBody: (value: string) => void;
    loadEmailDetail: (emailId: string) => Promise<void>;
}) {
    useEffect(() => {
        if (!selectedEmailId) {
            setSelectedEmailDetail(null);
            setEmailClassification(null);
            setIsReplying(false);
            setReplyBody('');
            return;
        }
        setIsReplying(false);
        setReplyBody('');
        void loadEmailDetail(selectedEmailId);
    }, [selectedEmailId, setSelectedEmailDetail, setEmailClassification, setIsReplying, setReplyBody, loadEmailDetail]);
}
