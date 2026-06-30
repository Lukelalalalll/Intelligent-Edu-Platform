'use client';

import React, { useState } from "react";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/shared/i18n";
import { Textarea } from "@/components/ui/textarea";

interface SaveLayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    layoutName: string,
    description: string,
    template_info_id: string
  ) => Promise<string | null>;
  isSaving: boolean;
  template_info_id: string;
}

export const SaveLayoutModal: React.FC<SaveLayoutModalProps> = ({
  isOpen,
  onClose,
  onSave,
  isSaving,
  template_info_id,
}) => {
  const { t } = useI18n();
  const [layoutName, setLayoutName] = useState("");
  const [description, setDescription] = useState("");

  const handleSave = async () => {
    if (!layoutName.trim()) {
      return;
    }
    await onSave(layoutName.trim(), description.trim(), template_info_id);
  };

  const handleClose = () => {
    if (!isSaving) {
      setLayoutName("");
      setDescription("");
      onClose();
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]" style={{ zIndex: 1000 }}>
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Save className="h-5 w-5 text-primary" />
              {t("ppt_generator.customTemplate.saveModal.title")}
            </span>
          </DialogTitle>
          <DialogDescription>
            {t("ppt_generator.customTemplate.saveModal.body")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-4">
          <div className="grid gap-2">
            <Label htmlFor="layout-name" className="text-sm font-medium">
              {t("ppt_generator.customTemplate.saveModal.name")}{" "}
              <span className="text-red-500">*</span>
            </Label>
            <Input
              id="layout-name"
              value={layoutName}
              onChange={(e) => setLayoutName(e.target.value)}
              placeholder={t("ppt_generator.customTemplate.saveModal.namePlaceholder")}
              disabled={isSaving}
              className="w-full"
              aria-required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description" className="text-sm font-medium">
              {t("ppt_generator.customTemplate.saveModal.description")}{" "}
              <span className="text-gray-400">
                {t("ppt_generator.customTemplate.saveModal.optional")}
              </span>
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("ppt_generator.customTemplate.saveModal.descriptionPlaceholder")}
              disabled={isSaving}
              className="w-full resize-none"
              rows={3}
            />
          </div>

          {isSaving && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-clock-icon lucide-clock"
              >
                <path d="M12 6v6l4 2">
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 12 12"
                    to="360 12 12"
                    dur="10s"
                    repeatCount="indefinite"
                  />
                </path>
                <circle cx="12" cy="12" r="10" />
              </svg>
              <span>{t("ppt_generator.customTemplate.saveModal.saving")}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSaving}
          >
            {t("ppt_generator.customTemplate.saveModal.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !layoutName.trim()}
            className="bg-green-600 hover:bg-green-700"
            aria-busy={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("ppt_generator.customTemplate.saveModal.savingButton")}
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {t("ppt_generator.customTemplate.saveModal.save")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
