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
import { cn } from "@/lib/utils";
import { useI18n } from "@/shared/i18n";
import WelcomeBanner from "@/shared/components/WelcomeBanner";
import entranceStyles from "@/shared/page-entrance/PageEntrance.module.css";
import { usePageEntrance } from "@/shared/page-entrance/usePageEntrance";
import styles from "./EmptyStateView.module.css";

const EmptyStateView: React.FC = () => {
  const { t } = useI18n();
  const router = useRouter();
  const isEntranceActive = usePageEntrance();

  return (
    <div className={styles.page}>
      <Wrapper
        className={cn(
          styles.container,
          entranceStyles.pageEntrance,
          isEntranceActive && entranceStyles.pageEntranceActive
        )}
      >
        <WelcomeBanner
          title={t("ppt_generator.outline.empty.banner.title")}
          subtitle={t("ppt_generator.outline.empty.banner.subtitle")}
          variant="workspace"
          className={styles.banner}
        />

        <section className={styles.workspaceGrid}>
          <article className={`${styles.surfaceCard} ${styles.primaryCard}`}>
            <div className={styles.primaryBody}>
              <div className={styles.heroBlock}>
                <span className={styles.badge}>
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("ppt_generator.outline.empty.badge")}
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
                  <h1 className={styles.title}>{t("ppt_generator.outline.empty.title")}</h1>
                  <p className={styles.description}>{t("ppt_generator.outline.empty.body")}</p>
                </div>
              </div>

              <div className={styles.actionRow}>
                <Button
                  onClick={() => router.push("/upload")}
                  className={styles.primaryAction}
                >
                  <Plus className="h-4 w-4" />
                  <span>{t("ppt_generator.outline.empty.cta")}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>

                <p className={styles.helperText}>
                  {t("ppt_generator.outline.empty.helper")}
                </p>
              </div>
            </div>
          </article>

          <aside className={styles.sideColumn}>
            <section className={`${styles.surfaceCard} ${styles.sideCard}`}>
              <span className={styles.mutedBadge}>
                <Layers3 className="h-3.5 w-3.5" />
                {t("ppt_generator.outline.empty.status.badge")}
              </span>
              <h2 className={styles.sideTitle}>{t("ppt_generator.outline.empty.status.title")}</h2>
              <div className={styles.statusList}>
                <div className={styles.statusItem}>
                  <span className={styles.statusLabel}>{t("ppt_generator.outline.empty.status.source")}</span>
                  <strong className={styles.statusValue}>{t("ppt_generator.outline.empty.status.sourceValue")}</strong>
                </div>
                <div className={styles.statusItem}>
                  <span className={styles.statusLabel}>{t("ppt_generator.outline.empty.status.stream")}</span>
                  <strong className={styles.statusValue}>{t("ppt_generator.outline.empty.status.streamValue")}</strong>
                </div>
                <div className={styles.statusItem}>
                  <span className={styles.statusLabel}>{t("ppt_generator.outline.empty.status.next")}</span>
                  <strong className={styles.statusValue}>{t("ppt_generator.outline.empty.status.nextValue")}</strong>
                </div>
              </div>
            </section>

            <section className={`${styles.surfaceCard} ${styles.sideCard}`}>
              <span className={styles.mutedBadge}>
                <Compass className="h-3.5 w-3.5" />
                {t("ppt_generator.outline.empty.route.badge")}
              </span>
              <h2 className={styles.sideTitle}>{t("ppt_generator.outline.empty.route.title")}</h2>
              <ul className={styles.stepList}>
                <li className={styles.stepItem}>{t("ppt_generator.outline.empty.route.step1")}</li>
                <li className={styles.stepItem}>{t("ppt_generator.outline.empty.route.step2")}</li>
                <li className={styles.stepItem}>{t("ppt_generator.outline.empty.route.step3")}</li>
              </ul>
            </section>
          </aside>
        </section>
      </Wrapper>
    </div>
  );
};

export default EmptyStateView;

