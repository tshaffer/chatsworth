import { Button } from "@mui/material";
import React, { useState } from "react";
import ImportFromDriveDialog from "./ImportFromDriveDialog";

export interface AppShellProps {
  pizza?: string;
}

const AppShell = (props: AppShellProps) => {

  const { pizza } = props;

  const [showImportMarkdownDialog, setShowImportMarkdownDialog] = useState(false);


  function handleCloseMarkdownDialog(): void {
    throw new Error("Function not implemented.");
  }

  return (
    <div>
      <h1>Chatsworth</h1>
      <Button onClick={() => setShowImportMarkdownDialog(true)}>
        Import Markdown
      </Button>
      <ImportFromDriveDialog
        open={showImportMarkdownDialog}
        onClose={handleCloseMarkdownDialog}
      />
    </div>
  );
}

export default AppShell;

