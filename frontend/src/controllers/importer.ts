import axios from "axios";
import { apiUrlFragment, getServerUrl } from "../types";

export const uploadFile = (formData: FormData): any => {
  return (dispatch: any, getState: any) => {
    const path = getServerUrl() + apiUrlFragment + 'importMarkdown';
    return axios.post(path, formData);
  };
};