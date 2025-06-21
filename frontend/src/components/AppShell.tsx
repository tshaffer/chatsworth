import React from "react";

export interface AppShellProps {
  pizza?: string;
}

const AppShell = (props: AppShellProps) => {

  const { pizza } = props;

  const [selectedFiles, setSelectedFiles] = React.useState<FileList | null>(null);

  const handleImportFilesSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFiles(event.target.files);
    }
  };

  const handleImport = async () => {
    console.log('handleImport: ', selectedFiles);
    if (selectedFiles && (selectedFiles.length > 0)) {
      // await handleImportFromDrive(baseDirectory, albumNodeId, selectedFiles);
    }

  };

  return (
    <div>
      <h1>App Shell</h1>
      {pizza && <p>Pizza: {pizza}</p>}
      {/* Other components and logic can be added here */}
      <input
        type="file"
        accept=".md"
        onChange={handleImportFilesSelect}
        id="importFilesInput"
        name="file"
        style={{ marginTop: '1rem' }}
      />
    </div>
  );
}

export default AppShell;

