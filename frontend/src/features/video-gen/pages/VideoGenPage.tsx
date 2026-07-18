import { usePageEntrance } from '@/shared/page-entrance/usePageEntrance';

import VideoGenWorkspaceView from '../components/workspace/VideoGenWorkspaceView';
import { useVideoGenWorkspace } from '../hooks/useVideoGenWorkspace';

export default function VideoGenPage() {
  const isEntranceActive = usePageEntrance();
  const workspace = useVideoGenWorkspace();

  return <VideoGenWorkspaceView workspace={workspace} isEntranceActive={isEntranceActive} />;
}
