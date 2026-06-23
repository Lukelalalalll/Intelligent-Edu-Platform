"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PresentationHeaderRegenerateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

const PresentationHeaderRegenerateDialog = ({
  open,
  onOpenChange,
  onConfirm,
}: PresentationHeaderRegenerateDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[360px] rounded-2xl border-0 p-0 shadow-2xl sm:max-w-[360px]">
        <DialogHeader className="items-center px-6 pb-4 pt-6 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <DialogTitle className="text-lg font-semibold text-[#191919]">
            Regenerate Presentation?
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-gray-500">
            This will replace the current slides with a newly generated version
            and clear undo history. Your current edits may be lost.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row border-t border-gray-100 p-0 sm:space-x-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="h-auto flex-1 rounded-none rounded-bl-2xl px-4 py-3.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-700"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onConfirm}
            className="h-auto flex-1 rounded-none rounded-br-2xl border-l border-gray-100 px-4 py-3.5 text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-600"
          >
            Regenerate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PresentationHeaderRegenerateDialog;
