import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";

const CONTENT = {
  terms: {
    title: "Terms of Service",
    body: [
      "By using FixMyCribs, you agree to these Terms. Please read them carefully.",
      "1. Service. FixMyCribs provides property and rent management tools for landlords, tenants, facility managers, and support staff.",
      "2. Accounts. You are responsible for keeping your account credentials secure. Public registration is only for landlord/owner accounts.",
      "3. Acceptable Use. You will not misuse the platform, attempt to gain unauthorized access, or use it for fraudulent activity.",
      "4. Subscriptions. Paid plans (Growth, Pro) require successful payment before activation. Admin-gifted plans grant access for the gifted duration only.",
      "5. Data. You retain ownership of the data you upload. FixMyCribs stores this data securely and processes it only to provide the service.",
      "6. Termination. You may cancel at any time from Settings. Cancelled or expired plans downgrade to Starter but do not delete data.",
      "7. Liability. FixMyCribs is provided on an 'as-is' basis. We do our best to keep the service reliable but do not warrant uninterrupted operation.",
      "8. Contact. For questions about these Terms, email legal@fixmycribs.com.",
    ],
  },
  privacy: {
    title: "Privacy Policy",
    body: [
      "This Privacy Policy explains how FixMyCribs collects, uses, and protects your data.",
      "1. Data we collect. Account details (name, email, phone), property/tenant records you enter, payment references, and usage logs.",
      "2. How we use it. To provide the service, send invitations and reminders, process payments, and improve the platform.",
      "3. Sharing. We do not sell your data. We share with payment providers (Paystack/Flutterwave), email delivery (SMTP/SendGrid), and hosting (secure cloud infrastructure) only as needed.",
      "4. Security. Passwords are hashed with bcrypt. Data is stored on secure infrastructure. Reset and invite tokens are single-use and hashed at rest.",
      "5. Your rights. You can request access, correction, or deletion of your personal data at any time by emailing privacy@fixmycribs.com.",
      "6. Retention. We retain records for as long as your account is active. Archived tenants and past bills remain available to landlords for compliance and audit.",
      "7. Cookies. We use minimal cookies for session/auth only. No third-party advertising trackers.",
      "8. Contact. For privacy questions, email privacy@fixmycribs.com.",
    ],
  },
  refund: {
    title: "Refund Policy",
    body: [
      "1. Free tier. The Starter plan is free — no refund needed.",
      "2. Monthly plans. Growth and Pro are billed monthly. You can cancel at any time — cancellation stops future charges but the current period remains active until it expires.",
      "3. Refund window. If you experienced a technical issue that prevented use of the service, contact support@fixmycribs.com within 7 days for a case-by-case review.",
      "4. Admin gifts. Gifted months are non-refundable but can be cancelled by admin at any time.",
      "5. Chargebacks. Disputes should be raised via support first. Fraudulent chargebacks may lead to account suspension.",
      "6. Contact. For refund inquiries, email support@fixmycribs.com.",
    ],
  },
};

export default function LegalPage() {
  const { doc } = useParams();
  const content = CONTENT[doc] || CONTENT.terms;
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-6">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-md bg-emerald-600 text-white grid place-items-center font-bold font-display">F</div>
          <span className="font-display font-bold">FixMyCribs NG</span>
        </Link>
        <Card className="p-8 border border-slate-200 bg-white">
          <div className="tiny-label text-emerald-700">Legal</div>
          <h1 className="font-display text-4xl font-black tracking-tight mt-2">{content.title}</h1>
          <div className="mt-2 text-xs text-slate-500">Last updated: {new Date().toLocaleDateString()}</div>
          <div className="mt-8 space-y-4 text-sm text-slate-700 leading-relaxed">
            {content.body.map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <div className="mt-10 pt-6 border-t border-slate-200 text-xs text-slate-500">
            FixMyCribs Technologies Ltd · Lagos, Nigeria · legal@fixmycribs.com
          </div>
        </Card>
        <div className="mt-6 flex gap-4 text-sm text-slate-600 justify-center">
          <Link to="/legal/terms" className="hover:text-slate-900">Terms</Link>
          <Link to="/legal/privacy" className="hover:text-slate-900">Privacy</Link>
          <Link to="/legal/refund" className="hover:text-slate-900">Refund</Link>
        </div>
      </div>
    </div>
  );
}
