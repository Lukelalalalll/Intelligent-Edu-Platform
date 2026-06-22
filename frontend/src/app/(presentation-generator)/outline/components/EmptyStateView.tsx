import React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Compass,
  FileText,
  Layers3,
  Plus,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Wrapper from "@/components/Wrapper";
import WelcomeBanner from "@/shared/components/WelcomeBanner";
import styles from "./EmptyStateView.module.css";

const EmptyStateView: React.FC = () => {
  const router = useRouter();

  return (
    <div className={styles.page}>
      <Wrapper className={styles.container}>
        <WelcomeBanner
          title="Outline Workspace"
          subtitle="Start a new Presenton flow to generate an outline, tune the structure, and move into polished slide generation."
          variant="workspace"
          className={styles.banner}
        />

        <section className={styles.workspaceGrid}>
          <article className={`${styles.surfaceCard} ${styles.primaryCard}`}>
            <div className={styles.primaryBody}>
              <div className={styles.heroBlock}>
                <span className={styles.badge}>
                  <Sparkles className="h-3.5 w-3.5" />
                  Presenton flow
                </span>

                <div className={styles.iconCluster} aria-hidden="true">
                  <div className={styles.iconHalo}></div>
                  <div className={styles.iconCore}>
                    <FileText className={styles.heroIcon} />
                  </div>
                  <div className={styles.iconAccent}>
                    <Plus className="h-4 w-4" />
                  </div>
                </div>

                <div className={styles.copyBlock}>
                  <h1 className={styles.title}>No presentation loaded yet</h1>
                  <p className={styles.description}>
                    This outline workspace is ready, but it does not have a
                    presentation source attached yet. Create a new presentation
                    to unlock the streamed outline, smooth card animation, and
                    template selection flow below.
                  </p>
                </div>
              </div>

              <div className={styles.actionRow}>
                <Button
                  onClick={() => router.push("/upload")}
                  className={styles.primaryAction}
                >
                  <Plus className="h-4 w-4" />
                  <span>Create New Presentation</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>

                <p className={styles.helperText}>
                  Start from a prompt or supporting files, then continue into
                  the outline builder automatically.
                </p>
              </div>
            </div>
          </article>

          <aside className={styles.sideColumn}>
            <section className={`${styles.surfaceCard} ${styles.sideCard}`}>
              <span className={styles.mutedBadge}>
                <Layers3 className="h-3.5 w-3.5" />
                Workspace status
              </span>
              <h2 className={styles.sideTitle}>What this page is waiting for</h2>
              <div className={styles.statusList}>
                <div className={styles.statusItem}>
                  <span className={styles.statusLabel}>Source</span>
                  <strong className={styles.statusValue}>Missing</strong>
                </div>
                <div className={styles.statusItem}>
                  <span className={styles.statusLabel}>Outline stream</span>
                  <strong className={styles.statusValue}>Standby</strong>
                </div>
                <div className={styles.statusItem}>
                  <span className={styles.statusLabel}>Next step</span>
                  <strong className={styles.statusValue}>Create presentation</strong>
                </div>
              </div>
            </section>

            <section className={`${styles.surfaceCard} ${styles.sideCard}`}>
              <span className={styles.mutedBadge}>
                <Compass className="h-3.5 w-3.5" />
                Next route
              </span>
              <h2 className={styles.sideTitle}>How the flow continues</h2>
              <ul className={styles.stepList}>
                <li className={styles.stepItem}>
                  Enter a prompt or attach source documents.
                </li>
                <li className={styles.stepItem}>
                  Generate the outline and review live slide cards here.
                </li>
                <li className={styles.stepItem}>
                  Choose a Presenton template family before deck generation.
                </li>
              </ul>
            </section>
          </aside>
        </section>
      </Wrapper>
    </div>
  );
};

export default EmptyStateView;
