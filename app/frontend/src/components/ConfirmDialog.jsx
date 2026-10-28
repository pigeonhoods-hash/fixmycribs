import { useState, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * useConfirm — replaces window.confirm() with a shadcn AlertDialog.
 * Returns [confirm, dialog]:
 *   confirm({ title, description, confirmText, cancelText, destructive }) => Promise<boolean>
 *   dialog: JSX to mount once per page.
 *
 * Usage:
 *   const [confirm, ConfirmDialog] = useConfirm();
 *   const ok = await confirm({ title: "Delete user?", description: "...", destructive: true });
 *   if (!ok) return;
 *   ...proceed...
 *   return (<>...<ConfirmDialog /></>)
 */
export function useConfirm() {
  const [state, setState] = useState({ open: false });

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      setState({
        open: true,
        title: opts?.title || "Are you sure?",
        description: opts?.description || "",
        confirmText: opts?.confirmText || "Confirm",
        cancelText: opts?.cancelText || "Cancel",
        destructive: !!opts?.destructive,
        resolve,
      });
    });
  }, []);

  const finish = (result) => {
    state.resolve?.(result);
    setState({ open: false });
  };

  const Dialog = () => (
    <AlertDialog open={state.open} onOpenChange={(o) => { if (!o) finish(false); }}>
      <AlertDialogContent className="bg-slate-900 border border-slate-700 text-white" data-testid="confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">{state.title}</AlertDialogTitle>
          {state.description && (
            <AlertDialogDescription className="text-slate-300 whitespace-pre-line">{state.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => finish(false)}
            className="bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700"
            data-testid="confirm-cancel"
          >
            {state.cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => finish(true)}
            className={state.destructive ? "bg-red-600 hover:bg-red-700 text-white" : "bg-orange-600 hover:bg-orange-700 text-white"}
            data-testid="confirm-ok"
          >
            {state.confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return [confirm, Dialog];
}
