import Link from "next/link";

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="hero">
        <h1>
          AI-Powered Complaint Resolution{" "}
          <span className="highlight">for Insurance</span>
        </h1>
        <p>
          Submit, track, and resolve insurance complaints with the help of
          intelligent classification. Insighta automatically prioritizes your
          tickets so issues get resolved faster.
        </p>
        <div className="hero-buttons">
          <Link href="/submit" className="btn-primary">
            Submit a Complaint
          </Link>
          <Link href="/track" className="btn-outline">
            Track Your Ticket
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="features">
        <h2>How It Works</h2>
        <div className="grid">
          <article className="card">
            <h3>1. Submit</h3>
            <p>
              File your insurance complaint through a simple form. Attach
              documents and describe the issue in your own words.
            </p>
          </article>
          <article className="card">
            <h3>2. Classify</h3>
            <p>
              Our NLP engine reads your complaint, detects the category, and
              assigns a priority level automatically.
            </p>
          </article>
          <article className="card">
            <h3>3. Resolve</h3>
            <p>
              Agents receive pre-sorted, high-priority tickets first — cutting
              response times and improving outcomes.
            </p>
          </article>
        </div>
      </section>
    </>
  );
}
