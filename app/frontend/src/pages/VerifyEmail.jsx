import { useEffect, useState, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatApiError } from "@/lib/password";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { MailCheck, Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function VerifyEmail() {
  const { token } = useParams();
  const nav = useNavigate();
  const { user, refreshUser, logout } = useAuth();
  const [status, setStatus] = useState(token ? "verifying" : "pending");
  const [error, setError] = useState("");
  const [resending, setResending] = useState(false);
  const [devLink, setDevLink] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    (async () => {
      try {
        await api.post("/auth/verify-email", { token });
        setStatus("success");
        try { await refreshUser(); } catch {}
      } catch (err) {
        setError(formatApiError(err.response?.data?.detail, "Invalid or expired verification link"));
        setStatus("error");
      }
    })();
  }, [token, refreshUser]);

  const resend = async () => {
    setResending(true);
    try {
      const r = await api.post("/auth/resend-verification");
      toast.success(r.data?.message || "Verification email sent");
      if (r.data?.dev_verification_link) setDevLink(r.data.dev_verification_link);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail, "Could not resend. Please log in again."));
    } finally {
      setResending(false);
    }
  };

  const goToApp = async () => {
    try { await refreshUser(); } catch {}
    nav("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <Card className="w-full max-w-md p-8 border border-slate-200 bg-white" data-testid="verify-email-card">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-emerald-600 text-white grid place-items-center font-bold font-display">F</div>
          <span className="font-display font-bold">FixMyCribs NG</span>
        </Link>

        {status === "verifying" && (
          <div className="mt-8 text-center" data-testid="verify-loading">
            <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mx-auto" />
            <h2 className="font-display text-2xl font-bold mt-4">Verifying your email…</h2>
          </div>
        )}

        {status === "success" && (
          <div className="mt-8 text-center" data-testid="verify-success">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <h2 className="font-display text-2xl font-bold mt-4">Email verified!</h2>
            <p className="text-slate-500 mt-1">Your account now has full access.</p>
            <Button onClick={goToApp} data-testid="verify-continue" className="mt-6 w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11">
              Continue to dashboard
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="mt-8 text-center" data-testid="verify-error">
            <XCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="font-display text-2xl font-bold mt-4">Verification failed</h2>
            <p className="text-slate-500 mt-1">{error}</p>
            {user && (
              <Button onClick={resend} disabled={resending} data-testid="verify-resend" className="mt-6 w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11">
                {resending ? "Sending…" : "Send a new link"}
              </Button>
            )}
          </div>
        )}

        {status === "pending" && (
          <div className="mt-8" data-testid="verify-pending">
            <MailCheck className="w-12 h-12 text-emerald-600" />
            <h2 className="font-display text-2xl font-bold mt-4">Confirm your email</h2>
            <p className="text-slate-500 mt-2">
              We sent a verification link to <span className="font-semibold text-slate-700">{user?.email || "your email"}</span>.
              Click the link in that email to unlock your account.
            </p>
            <Button onClick={resend} disabled={resending} data-testid="verify-resend" className="mt-6 w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11">
              {resending ? "Sending…" : "Resend verification email"}
            </Button>
            <Button onClick={goToApp} variant="outline" data-testid="verify-check-again" className="mt-3 w-full h-11">
              I've verified — continue
            </Button>
            {devLink && (
              <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs">
                <div className="font-semibold text-slate-600 mb-1">Didn't get the email? Use this link:</div>
                <a href={devLink} className="text-emerald-700 break-all hover:underline" data-testid="verify-dev-link">{devLink}</a>
              </div>
            )}
            <button onClick={() => { logout(); nav("/login"); }} className="mt-4 w-full text-center text-sm text-slate-500 hover:text-slate-700" data-testid="verify-logout">
              Log out
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
