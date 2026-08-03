import { useState } from "react";

export default function AppDataFreshnessBoundary({ AppComponent }) {
  const [revision] = useState(0);
  return <AppComponent key={`app-data-freshness-${revision}`} />;
}
