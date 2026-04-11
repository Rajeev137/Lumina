import { createBrowserRouter } from "react-router-dom";
import { RootLayout } from "@/components/layout/RootLayout";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { RfpPage } from "@/features/rfp/RfpPage";
import { KnowledgePage } from "@/features/knowledge/KnowledgePage";

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "rfp", element: <RfpPage /> },
      { path: "knowledge", element: <KnowledgePage /> },
    ],
  },
]);
