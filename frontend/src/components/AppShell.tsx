import { Button } from "@mui/material";
import React, { useState } from "react";
import ImportFromDriveDialog from "./ImportFromDriveDialog";
import { ChatEntry } from "../types";
import ChatViewer from "./ChatViewer";

export interface AppShellProps {
  pizza?: string;
}

const AppShell = (props: AppShellProps) => {

  const { pizza } = props;

  const [entries, setEntries] = useState<ChatEntry[]>([]);

  const [showImportMarkdownDialog, setShowImportMarkdownDialog] = useState(false);


  const handleSetChatEntries = (chatEntries: any) => {
    console.log("Chat entries set:", chatEntries);
    setEntries(chatEntries);
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
        onSetChatEntries={(chatEntries) => handleSetChatEntries(chatEntries)}
        onClose={handleCloseMarkdownDialog}
      />
      <ChatViewer chatEntries={entries} />
    </div>
  );
}

export default AppShell;

