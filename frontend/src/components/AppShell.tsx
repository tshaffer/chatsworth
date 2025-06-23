import { Button } from "@mui/material";
import React, { useState } from "react";
import ImportFromDriveDialog from "./ImportFromDriveDialog";
import { ChatEntry, ParsedMarkdown } from "../types";
import ChatViewer from "./ChatViewer";

export interface AppShellProps {
  pizza?: string;
}

const AppShell = (props: AppShellProps) => {

  const { pizza } = props;

  const [parsedMarkdown, onSetParsedMarkdown] = useState<ParsedMarkdown>({ chatEntries: [], metadata: null });

  const [showImportMarkdownDialog, setShowImportMarkdownDialog] = useState(false);


  const handleSetParsedMarkdown = (parsedMarkdown: ParsedMarkdown) => {
    console.log("ParsedMarkdown set:", parsedMarkdown);
    onSetParsedMarkdown(parsedMarkdown);
  };

  function handleCloseMarkdownDialog(): void {
    setShowImportMarkdownDialog(false);
  }

  return (
    <div>
      <h1>Chatsworth</h1>
      <Button onClick={() => setShowImportMarkdownDialog(true)}>
        Import Markdown
      </Button>
      <ImportFromDriveDialog
        open={showImportMarkdownDialog}
        onSetParsedMarkdown={(parsedMarkdown) => handleSetParsedMarkdown(parsedMarkdown)}
        onClose={handleCloseMarkdownDialog}
      />
      <ChatViewer parsedMarkdown={parsedMarkdown} />
    </div>
  );
}

export default AppShell;

