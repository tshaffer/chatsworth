import { Button } from "@mui/material";
import { useState } from "react";
import { useDispatch } from 'react-redux';

import { ParsedMarkdown } from "../types";
import ImportFromDriveDialog from "./ImportFromDriveDialog";
import ChatViewer from "./ChatViewer";

import { setParsedMarkdown } from '../redux/parsedMarkdownSlice';

const AppShell = () => {

  const dispatch = useDispatch();

  const [showImportMarkdownDialog, setShowImportMarkdownDialog] = useState(false);

  const handleSetParsedMarkdown = (parsedMarkdown: ParsedMarkdown) => {
    dispatch(setParsedMarkdown(parsedMarkdown));
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
      <ChatViewer/>
    </div>
  );
}

export default AppShell;

