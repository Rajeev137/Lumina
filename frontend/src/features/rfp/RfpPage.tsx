import { SingleQuestionForm } from "./components/SingleQuestionForm";
import { BatchUploadForm } from "./components/BatchUploadForm";

export function RfpPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-heading">
          RFP Processing
        </h2>
        <p className="text-muted-foreground">
          Submit questions individually or upload a batch Excel template.
        </p>
      </section>

      <SingleQuestionForm />
      <BatchUploadForm />
    </div>
  );
}
