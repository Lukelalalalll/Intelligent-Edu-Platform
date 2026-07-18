import Button from '@/shared/components/Button/Button';

import type { VideoProject, VideoProjectEvent, VideoShot } from '../../api/videoApi';
import { STATUS_LABELS, formatDate } from '../../workspace/videoGenWorkspaceModel';
import styles from '../../styles/videoGen.module.css';

interface VideoGenScriptStepProps {
  selectedProject: VideoProject | null;
  shots: VideoShot[];
  pipelineEvents: VideoProjectEvent[];
  isPlanning: boolean;
  actionLoading: string;
  onBackToInput: () => void;
  onGenerateScripts: () => Promise<void>;
  onContinueToScene: () => void;
  onScriptEdit: (index: number, value: string) => void;
}

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.statChip}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function VideoGenScriptStep({
  selectedProject,
  shots,
  pipelineEvents,
  isPlanning,
  actionLoading,
  onBackToInput,
  onGenerateScripts,
  onContinueToScene,
  onScriptEdit,
}: VideoGenScriptStepProps) {
  return (
    <>
      <div className={styles.workflowStepBody}>
        {!selectedProject ? (
          <div className={styles.emptyHint}>
            Start from the input step to create a project and generate scripts.
          </div>
        ) : isPlanning ? (
          <div className={styles.scriptProgressShell}>
            <div className={styles.progressArea}>
              <div className={styles.progressBar}>
                <div style={{ width: `${selectedProject.progress || 0}%` }} />
              </div>
              <p>
                {selectedProject.progress || 0}% -{' '}
                {selectedProject.latest_message || 'Planning project scripts...'}
              </p>
            </div>
            <div className={styles.eventFeed}>
              {pipelineEvents.length === 0 ? (
                <div className={styles.emptyHint}>Waiting for planning events...</div>
              ) : (
                pipelineEvents.map((event: VideoProjectEvent, index: number) => (
                  <div key={`${event.ts}-${index}`} className={styles.eventRow}>
                    <div>
                      <strong>{event.step}</strong>
                      <p>{event.message}</p>
                    </div>
                    <span>{event.progress ?? '-'}%</span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className={styles.scriptStepGrid}>
            <section className={styles.workflowSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <h4>Scene Scripts</h4>
                  <p>Each scene script is editable before you move into the scene editor.</p>
                </div>
              </div>

              {selectedProject.scenes.length === 0 ? (
                <div className={styles.emptyHint}>
                  No planned scenes yet. Return to input and generate scripts from the current source.
                </div>
              ) : (
                <div className={styles.scriptPlannerList}>
                  {selectedProject.scenes.map((scene, index) => (
                    <label key={scene.id} className={styles.scriptPlannerItem}>
                      <span>Scene {index + 1}</span>
                      <textarea
                        rows={4}
                        value={scene.script}
                        onChange={(event) => onScriptEdit(index, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              )}
            </section>

            <div className={styles.sideColumn}>
              <section className={styles.workflowSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h4>Plan Snapshot</h4>
                    <p>Status, counts, and the current project planning context.</p>
                  </div>
                </div>
                <div className={styles.statsRow}>
                  <StatChip label="Scenes" value={selectedProject.metrics?.scene_count || 0} />
                  <StatChip label="Shots" value={selectedProject.metrics?.shot_count || 0} />
                  <StatChip
                    label="Status"
                    value={STATUS_LABELS[selectedProject.status] || selectedProject.status}
                  />
                  <StatChip label="Updated" value={formatDate(selectedProject.updated_at)} />
                </div>
              </section>

              <section className={styles.workflowSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h4>Shot List</h4>
                    <p>AI-generated shot prompts from the current planner provider, ready for render.</p>
                  </div>
                </div>

                <div className={styles.shotList}>
                  {shots.length === 0 ? (
                    <div className={styles.emptyHint}>Shots appear after planning.</div>
                  ) : (
                    shots.map((shot: VideoShot) => (
                      <div key={shot.shot_id} className={styles.shotCard}>
                        <div className={styles.shotHeader}>
                          <strong>
                            Scene {shot.scene_order} / Shot {shot.shot_order}
                          </strong>
                          <span
                            className={`${styles.statusBadge} ${
                              styles[`status_${shot.status}`] || ''
                            }`}
                          >
                            {STATUS_LABELS[shot.status] || shot.status}
                          </span>
                        </div>
                        <div className={styles.shotMeta}>
                          <span>{shot.shot_type}</span>
                          <span>{shot.duration_seconds}s</span>
                          <span>{shot.provider || 'pending'}</span>
                        </div>
                        <p>{shot.visual_prompt}</p>
                        {shot.error ? <div className={styles.errorTip}>{shot.error}</div> : null}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>

      <div className={styles.workflowFooter}>
        <div className={styles.workflowFooterActions}>
          <Button type="button" variant="ghost" onClick={onBackToInput}>
            Back to Input
          </Button>
        </div>
        <div className={styles.workflowFooterActions}>
          <Button
            type="button"
            variant="outline"
            onClick={onGenerateScripts}
            disabled={actionLoading !== ''}
          >
            {actionLoading === 'plan' ? 'Generating...' : 'Regenerate Script'}
          </Button>
          <Button type="button" onClick={onContinueToScene} disabled={!selectedProject?.scenes.length}>
            Continue to Scene
          </Button>
        </div>
      </div>
    </>
  );
}
