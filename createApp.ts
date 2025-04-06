import express, { Application, Request, Response } from 'express';


import fs from 'fs-extra'; // Import fs-extra
import path from 'path'; // Import path for file system operations
import archiver from 'archiver'; // Import archiver for zipping files
// import cheerio from 'cheerio'; // Import cheerio for parsing and manipulating HTML
import * as cheerio from 'cheerio';
import todoListData from '../listing.json'; // Import JSON file directly (JSON support is native in TypeScript)

import RASPUIPage, { DataToReturnType, UIItems } from '../models/RASPUIPage'

// Import functions from dbOperations module (ensure the module exports proper types/interfaces)
import {
  createOrUpdateApplication,
  createOrUpdatePage,
  getPageData,
  getAllApplications,
  getCustomComponent,
  getCustomComponentsByUserId,
  createOrUpdateCustomComponent,
  getAllPagesOfApplication,
  getApplication
} from './dbOperations';
import { verifyJWT } from "./server_keycloak"
import UIElement from '../models/UIElement';
import apiConfig from '../config/apiConfig';
// import { UIItems } from '../context/boardContext';
// const { verifyJWT } = require('./server_keycloak.js');



const router = express.Router();


const reactAppsDir = path.join(__dirname, '..', 'React Apps');
const baseAppDir = path.join(reactAppsDir, 'Base App');

const createProjectDirectory = async (projectDir: any) => {
  if (!fs.existsSync(projectDir)) {
    await fs.copy(baseAppDir, projectDir, {
      filter: (src) => !src.includes('src/components/Login/Login')
    });
  }
};

const copyLoginPages = async (projectDir: any) => {
  const loginDirSource = path.join(baseAppDir, 'src', 'components', 'Login');
  const loginDirDestination = path.join(projectDir, 'src', 'components', 'Login');

  await fs.ensureDir(loginDirDestination);
  await fs.copy(loginDirSource, loginDirDestination);
};

const createCssFile = async (cssData: any, componentName: any, projectDir: any) => {
  const cssFilePath = path.join(projectDir, 'src', 'components', `${componentName}.css`);
  let cssContent = '';

  for (const id in cssData) {
    if (typeof cssData[id] === 'object' && cssData[id] !== null) {
      cssContent += `#${id} {\n`;

      for (const property in cssData[id]) {
        cssContent += `  ${property}: ${cssData[id][property]};\n`;
      }

      cssContent += `}\n\n`;
    } else {
      console.warn(`Invalid CSS data for ID: ${id}. Expected an object.`);
    }
  }

  await fs.outputFile(cssFilePath, cssContent);
  return `./${componentName}.css`;
};

const updateLoginTsx = async (projectDir: any, loginPageId: any) => {
  const loginTsxPath = path.join(projectDir, 'src', 'components', 'Login', 'Login.tsx');
  let loginTsxContent = await fs.readFile(loginTsxPath, 'utf-8');

  const importStatement = `import Login${loginPageId} from "./Login${loginPageId}";\n`;
  if (!loginTsxContent.includes(importStatement)) {
    loginTsxContent = importStatement + loginTsxContent;
  }

  const returnStatement = `
    return (
      <Login${loginPageId} 
        formData={formData} 
        setFormData={setFormData} 
        error={error} 
        setError={setError} 
        handleSubmit={handleSubmit} 
        isEmailValid={isEmailValid} 
        isPasswordValid={isPasswordValid} 
      />
    );
  `;

  // loginTsxContent = loginTsxContent.replace(/return\s*\(.*\);/, returnStatement);
  loginTsxContent = loginTsxContent.replace(/return\s*\([\s\S]*?\);/, returnStatement);
  console.log("div added in login", loginTsxContent);
  await fs.writeFile(loginTsxPath, loginTsxContent);
};

const updateAppJs = async (projectDir: any, componentName: any, page: any, loginPageAdded: any) => {
  const appJsPath = path.join(projectDir, 'src', 'App.js');
  let appJsContent = await fs.readFile(appJsPath, 'utf-8');

  const importStatement = `import ${componentName} from "./components/${componentName}";\n`;
  if (!appJsContent.includes(importStatement)) {
    appJsContent = importStatement + appJsContent;
  }

  const routeStatement = `<Route path='/${page.toLowerCase()}' element={<${componentName} />}/>`;
  const routesClosingTag = '</Routes>';
  if (!appJsContent.includes(routeStatement)) {
    appJsContent = appJsContent.replace(routesClosingTag, `  ${routeStatement}\n${routesClosingTag}`);
  }

  if (loginPageAdded) {
    const loginComponentName = 'Login';
    const loginImportStatement = `import ${loginComponentName} from "./components/Login/Login";\n`;
    if (!appJsContent.includes(loginImportStatement)) {
      appJsContent = loginImportStatement + appJsContent;
    }

    const loginRouteStatement = `<Route path='/login' element={<${loginComponentName} />}/>`;
    if (!appJsContent.includes(loginRouteStatement)) {
      appJsContent = appJsContent.replace(routesClosingTag, `  ${loginRouteStatement}\n${routesClosingTag}`);
    }
  }

  await fs.writeFile(appJsPath, appJsContent);
};

const createAndDownloadZip = (projectDir: any, project: any, res: any) => {
  const zipPath = path.join(__dirname, `${project}.zip`);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    res.download(zipPath, `${project}.zip`, (err: any) => {
      //console.log("Zip stream finished.");
      if (err) {
        console.error("Download error:", err);
        throw err;
      }
      fs.unlinkSync(zipPath);
    });
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);
  archive.directory(projectDir, false);
  archive.finalize();
};

const extractCardHtml = (htmlContent: any, containerId: any) => {
  //console.log("id1: ", containerId)
  //console.log("html content while laoding:", htmlContent)
  const $ = cheerio.load(htmlContent);
  const container = $(`#${containerId}`);

  if (container.length) {
    return container.html() || '';
  }

  return '';
};



const removeCardHtml = (htmlContent: any, containerId: any) => {

  const replaceContent = `PLACEHOLDERCONTENT`;

  const $ = cheerio.load(htmlContent, {
    xmlMode: false
    // decodeEntities: false
  });

  const targetDiv = $(`#${containerId}`);

  targetDiv.html(replaceContent);

  const updatedHtml = $.html();
  const cleanHtml = updatedHtml.replace(/<\/?html[^>]*>/gi, '')
    .replace(/<\/?head[^>]*>/gi, '')
    .replace(/<\/?body[^>]*>/gi, '');

  return cleanHtml;
};
// const removeCardHtml = (htmlContent:any, containerId:any, cardName:any, cardCount:any) => {
//   // JSX content to be inserted
//   const jsxContent = `{data.map((product, index) => (
//     <${cardName} key={index} product={product} />
//   ))}`;

//   // Temporary placeholder content
//   const replaceContent = `PLACEHOLDERCONTENT`;

//   // Parse the HTML string into a Document object
//   const parser = new DOMParser();
//   const doc = parser.parseFromString(htmlContent, 'text/html');

//   // Find the target container by its ID
//   const targetDiv = doc.getElementById(containerId);

//   if (targetDiv) {
//     // Replace the content of the target container with the placeholder
//     targetDiv.innerHTML = replaceContent;
//   }

//   // Serialize the updated document back to a string
//   const updatedHtml = doc.documentElement.outerHTML;

//   // Clean up by removing unnecessary <html>, <head>, and <body> tags
//   const cleanHtml = updatedHtml
//     .replace(/<\/?html[^>]*>/gi, '')
//     .replace(/<\/?head[^>]*>/gi, '')
//     .replace(/<\/?body[^>]*>/gi, '');

//   // Replace the placeholder with the JSX content
//   return cleanHtml.replace(`PLACEHOLDERCONTENT`, jsxContent);
// };

const replaceInputsWithCalendar = (htmlContent: any, id: any) => {
  let modifiedHtmlContent = htmlContent;
  const inputRegex = new RegExp(`<input[^>]*id="${id}"[^>]*>`, 'g');
  const inputMatch = inputRegex.exec(htmlContent);

  if (inputMatch) {
    const inputElement = inputMatch[0];
    const classNameMatch = inputElement.match(/class="([^"]*)"/);
    const placeholderMatch = inputElement.match(/placeholder="([^"]*)"/);

    const className = classNameMatch ? classNameMatch[1] : '';
    const placeholder = placeholderMatch ? placeholderMatch[1] : '';
    const calendarComponent = `<Calendar className="${className}" placeholder="${placeholder}" />`;

    modifiedHtmlContent = modifiedHtmlContent.replace(inputElement, calendarComponent);
  }
  return modifiedHtmlContent;
};

const replacePropsWithProduct = async (filePath: any) => {
  try {
    let fileContent = await fs.readFile(filePath, 'utf-8');

    fileContent = fileContent.replace(/\bprops\b/g, 'product');
    fileContent = fileContent.replace(/product\.(\w+)/g, '{product.$1}');

    await fs.writeFile(filePath, fileContent);
  } catch (error) {
    console.error(`Error updating file ${filePath}:`, error);
  }
};

function replaceClassNames(htmlContent: any) {
  return htmlContent
    .replace(/\bclass=/g, 'className=')
    .replace(/\bclassname=/g, 'className=')
    .replace(/<calendar\b([^>]*)>/gi, '<Calendar$1>')
    .replace(/<\/calendar>/gi, '</Calendar>');
  // .replace(/<input([^>]*)>/g, '<input$1 />');
}

const replaceProductKeys = (filePath: any) => {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const updatedFileContent = fileContent.replace(/product\.(\w+)/g, (match, key) => {
      return `product.${key}()`;
    });

    fs.writeFileSync(filePath, updatedFileContent);
  } catch (error) {
    console.error(`Error updating file ${filePath}:`, error);
  }
};

const createHookFile = async (projectDir: any, componentName: any, apiName: any) => {
  const hooksDirPath = path.join(projectDir, 'src', 'hooks');
  const hookFileName = `use${componentName}Hook.ts`;
  const hookFilePath = path.join(hooksDirPath, hookFileName);

  if (!fs.existsSync(hooksDirPath)) {
    fs.mkdirSync(hooksDirPath);
  }

  // http://localhost:8000/api/

  const hookFileContent = `
import { useEffect, useState } from 'react';
import ${componentName}Model from '../models/${componentName}Model';

const use${componentName}Hook = () => {

  const [data, setData] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      const data1 = await fetch('${apiName}', {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      }).then(response => response.json())

      const modelInstances = data1.map((item: any) => new ${componentName}Model(item));
      setData(modelInstances);
    }
    
    fetchData();
  }, []);
  
  return {
    data,
  }
};

export default use${componentName}Hook;`;

  fs.writeFileSync(hookFilePath, hookFileContent, 'utf8');
};

const createHookTableFile = async (projectDir: any, componentName: any, apiName: any, tableCount: any) => {
  const hooksDirPath = path.join(projectDir, 'src', 'hooks');
  const hookFileName = `use${componentName}${tableCount}Hook.ts`;
  const hookFilePath = path.join(hooksDirPath, hookFileName);

  if (!fs.existsSync(hooksDirPath)) {
    fs.mkdirSync(hooksDirPath);
  }

  // http://localhost:8000/api/

  const hookFileContent = `
import { useEffect, useState } from 'react';

const use${componentName}${tableCount}Hook = () => {

  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('${apiName}', {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch data");
        }

        const result = await response.json();
        setData(result);
        //console.log(result)
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
    }
    };

    fetchData();
  }, []);

  return {
    data, isLoading
  };
};

export default use${componentName}${tableCount}Hook;`;

  fs.writeFileSync(hookFilePath, hookFileContent, 'utf8');
};

const createModelFile = async (projectDir: any, componentName: any, apiName: any) => {
  const modelDirPath = path.join(projectDir, 'src', 'models');
  const modelFileName = `${componentName}Model.ts`;
  const modelFilePath = path.join(modelDirPath, modelFileName);

  if (!fs.existsSync(modelDirPath)) {
    fs.mkdirSync(modelDirPath);
  }

  const response = await fetch(`${apiName}`);
  // const response = await fetch(`http://localhost:8000/api/flightlist1`);
  const data = await response.json();
  //console.log("data after fetching", response)

  const keys = Object.keys(data[0]);

  let classContent = `class ${componentName}Model {\n  #remoteData;\n\n  constructor(remoteData: any) {\n    this.#remoteData = remoteData;\n  }\n\n`;
  keys.forEach(key => {
    classContent += `  ${key}() {\n    return this.#remoteData.${key};\n  }\n\n`;
    classContent += `  set${key.charAt(0).toUpperCase() + key.slice(1)}(value: any) {\n    this.#remoteData.${key} = value;\n  }\n\n`;
  });

  classContent += `}\n\nexport default ${componentName}Model;\n`;

  fs.writeFileSync(modelFilePath, classContent, 'utf8');
};

const createTableFile = async (projectDir: any, componentName: any, tableCount: any) => {
  const tableDirPath = path.join(projectDir, 'src', 'tables');
  const tableFileName = `${componentName}${tableCount}Table.tsx`;
  const tableFilePath = path.join(tableDirPath, tableFileName);

  if (!fs.existsSync(tableDirPath)) {
    fs.mkdirSync(tableDirPath);
  }

  const tableContent = `
import React from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef } from 'ag-grid-community';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import use${componentName}${tableCount}Hook from '../hooks/use${componentName}${tableCount}Hook';

ModuleRegistry.registerModules([AllCommunityModule]);

export default function ${componentName}${tableCount}Table() {
    const { data, isLoading } = use${componentName}${tableCount}Hook();

    const colData: ColDef[] = React.useMemo(() => {
        if (!data || data.length === 0) return [];
        return Object.keys(data[0]).map(key => ({
            field: key,
            sortable: true,
            filter: true,
        }));
    }, [data]);

    if (isLoading) {
        return <div>Loading...</div>;
    }

    if (!data || data.length === 0) {
        return <div>No data available</div>;
    }

    return (
      <AgGridReact
          rowData={data}
          columnDefs={colData}
          pagination={true}
          paginationPageSize={10}
          paginationPageSizeSelector={[20]}
          rowSelection="multiple"
      />
    )
  }`;

  fs.writeFileSync(tableFilePath, tableContent, 'utf8');
}


const getImportsAndStates = (resName:any,operation:any)=>{
  const importsAndStates :any = {

    Create:`import React, { useState, useEffect } from 'react';

export type resourceMetaData = {
  resource: string;
  fieldValues: any[];
};

const ${operation}${resName} = () => {
  const [resMetaData, setResMetaData] = useState<resourceMetaData[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [dataToSave, setDataToSave] = useState<any>({});
  const [showToast, setShowToast] = useState<any>(false);
  const [foreignkeyData, setForeignkeyData] = useState<Record<string, any[]>>({});
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const regex = /^(g_|archived|extra_data)/;
  const apiUrl = '${apiConfig.getResourceUrl(resName.toLowerCase())}?'
  const metadataUrl = '${apiConfig.getResourceMetaDataUrl(resName)}?'
  // Fetch metadata
  useEffect(() => {
    const fetchResMetaData = async () => {
      const fetchedResources = new Set();
      console.log("fectched resources",fetchedResources)
      try {
        const data = await fetch(
          metadataUrl,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }
        );

        if (data.ok) {
          const metaData = await data.json();
          setResMetaData(metaData);
          setFields(metaData[0].fieldValues);
          const foreignFields = metaData[0].fieldValues.filter((field: any) => field.foreign);
          console.log("foreign fields",foreignFields)
          for (const field of foreignFields) {
            if (!fetchedResources.has(field.foreign)) {
              fetchedResources.add(field.foreign);
              await fetchForeignData(field.foreign, field.name, field.foreign_field);
            }
          }
        } else {
          console.error('Failed to fetch components:', data.statusText);
        }
      } catch (error) {
        console.error('Error fetching components:', error);
      }
    };

    fetchResMetaData();
   
  }, []);

  useEffect(()=>{
    console.log("data to save",dataToSave)
  },[dataToSave])

  const fetchForeignData = async (foreignResource: string, fieldName: string, foreignField: string) => {
    
   
    try {
      const params = new URLSearchParams();
      const ssid: any = sessionStorage.getItem('key');
      params.append('queryId', 'GET_ALL');
      params.append('session_id', ssid);

      const response = await fetch(
        \`${apiConfig.API_BASE_URL}/\${foreignResource.toLowerCase()}?\`+params.toString(),
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setForeignkeyData((prev) => ({
          ...prev,
          [foreignResource]: data.resource
        }));
        
      } else {
        console.error(\`Error fetching foreign data for \${fieldName}:\`, response.status);
      }
    } catch (error) {
      console.error(\`Error fetching foreign data for \${fieldName}:\`, error);
    }
  };

  const handleCreate = async () => {
    const params = new URLSearchParams();
    const jsonString = JSON.stringify(dataToSave);
    const base64Encoded = btoa(jsonString);
    params.append('resource', base64Encoded);
    const ssid: any = sessionStorage.getItem('key');
    params.append('session_id', ssid);
    
    const response = await fetch(apiUrl+params.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (response.ok) {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      setDataToSave({});
    }
  };

  const handleSearchChange = (fieldName: string, value: string) => {
    setSearchQueries((prev) => ({ ...prev, [fieldName]: value }));
  };
`,
    
    Read:` 
    import React, { useState } from 'react';
                  import { useEffect } from 'react';
                  
                  export type ResourceMetaData = {
                    "resource": string,
                    "fieldValues":any[]
                  }
  
                  const ${operation}${resName}= () => {
    const [resMetaData, setResMetaData] = useState<ResourceMetaData[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [dataToSave, setDataToSave] = useState<any>({});
  const [requiredFields, setRequiredFields] = useState<string[]>([]);
  const [fetchData, setFetchedData] = useState<any[]>([]);
   const [showToast,setShowToast] = useState<any>(false);

  const regex = /^(g_|archived|extra_data)/;
  const apiUrl = '${apiConfig.getResourceUrl(resName.toLowerCase())}?'
  const metadataUrl = '${apiConfig.getResourceMetaDataUrl(resName)}?'
  const BaseUrl = '${apiConfig.API_BASE_URL}';
  // Fetch resource data
  useEffect(() => {
    const fetchResourceData = async () => {
      console.log('Fetching data...');
      const params = new URLSearchParams();
      const ssid: any = sessionStorage.getItem('key');
      const queryId: any = 'GET_ALL';
      params.append('queryId', queryId);
      params.append('session_id', ssid);
      try {
        const response = await fetch(
          apiUrl+params.toString(),
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
        if (!response.ok) {
          throw new Error('Error:'+ response.status);
        }
        const data = await response.json();
        console.log('Data after fetching', data);
        setFetchedData(data.resource || []);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    fetchResourceData();
  }, []);

  // Fetch metadata
  useEffect(() => {
    const fetchResMetaData = async () => {
      try {
        const response = await fetch(
          metadataUrl,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }
        );
        if (response.ok) {
          const metaData = await response.json();
          setResMetaData(metaData);
          setFields(metaData[0]?.fieldValues || []);
          const required = metaData[0]?.fieldValues
            .filter((field: any) => !regex.test(field.name))
            .map((field: any) => field.name);
          setRequiredFields(required || []);
        } else {
          console.error('Failed to fetch metadata:'+ response.statusText);
        }
      } catch (error) {
        console.error('Error fetching metadata:', error);
      }
    };
    fetchResMetaData();
  }, []);`,
  Update: `
  import React, { useState } from 'react';
  import { useEffect } from 'react';
  import { useNavigate } from "react-router-dom";
  
  export type ResourceMetaData = {
    "resource": string,
    "fieldValues": any[]
  }
  
  const ${operation}${resName} = () => {
    const [resMetaData, setResMetaData] = useState<ResourceMetaData[]>([]);
    const [fields, setFields] = useState<any[]>([]);
    const [requiredFields, setRequiredFields] = useState<string[]>([]);
    const [fetchData, setFetchedData] = useState<any[]>([]);
    const [editedData, setEditedData] = useState<any>({});
     const [showToast,setShowToast] = useState<any>(false);
       const navigate = useNavigate();
  const regex = /^(g_|archived|extra_data)/;
  const apiUrl = '${apiConfig.getResourceUrl(resName.toLowerCase())}?'
  const metadataUrl = '${apiConfig.getResourceMetaDataUrl(resName)}?'
  const BaseUrl = '${apiConfig.API_BASE_URL}';

   const [currentUrl, setCurrentUrl] = useState('');
    // Fetch resource data
    useEffect(() => {
      const fetchResourceData = async () => {
        const params = new URLSearchParams();
        const ssid: any = sessionStorage.getItem('key');
        const queryId: any = 'GET_ALL';
        params.append('queryId', queryId);
        params.append('session_id', ssid);
        try {
          const response = await fetch(
            apiUrl + params.toString(),
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );
          if (!response.ok) {
            throw new Error('Error:'+ response.status);
          }
          const data = await response.json();
          const fetchedData = data.resource || [];
          setFetchedData(fetchedData);
          const initialEditedData = fetchedData.reduce((acc: any, item: any) => {
            acc[item.id] = { ...item };
            return acc;
          }, {});
          console.log('Initial edited data:', initialEditedData);
          setEditedData(initialEditedData);
        } catch (error) {
          console.error('Error fetching data:', error);
        }
      };
      fetchResourceData();
      setCurrentUrl(window.location.href);
    }, []);
  
    // Fetch metadata
    useEffect(() => {
      const fetchResMetaData = async () => {
        try {
          const response = await fetch(
            metadataUrl,
            {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
            }
          );
          if (response.ok) {
            const metaData = await response.json();
            setResMetaData(metaData);
            setFields(metaData[0]?.fieldValues || []);
            const required = metaData[0]?.fieldValues
              .filter((field: any) => !regex.test(field.name))
              .map((field: any) => field.name);
            setRequiredFields(required || []);
          } else {
            console.error('Failed to fetch metadata:'+ response.statusText);
          }
        } catch (error) {
          console.error('Error fetching metadata:', error);
        }
      };
      fetchResMetaData();
    }, []);
  
    const handleEdit = (id: any, field: string, value: string) => {
      setEditedData((prevData: any) => ({
        ...prevData,
        [id]: {
          ...(prevData[id] || {}),
          [field]: value,
        },
      }));
    };
  
    const handleUpdate = async (id: any) => {

    navigate('/edit',{state:{id:id,editedData:editedData,resName:'${resName}',currUrl:currentUrl,apiUrl:apiUrl.toString(),metadataUrl:metadataUrl.toString(),BaseUrl:BaseUrl.toString()}});
    };
  
   
  `,
  } 
  return importsAndStates[operation]
}



const operationsDiv: any = {
  Create:`<div>
      
      <div className="container mt-4">
        {fields.map((field, index) => {
          if (field.name !== 'id' && !regex.test(field.name)) {
            if (field.foreign) {
              console.log("FK",foreignkeyData)
              const options = foreignkeyData[field.foreign] || [];
              const filteredOptions = options.filter((option) =>
                option[field.foreign_field].toLowerCase().includes((searchQueries[field.name] || '').toLowerCase())
              );
              console.log("fo",filteredOptions)
              console.log("ooo",options)
              return (
                <div key={index} className="dropdown">
                  <label style={{ display: 'block' }}>
                    {field.required && <span style={{ color: 'red' }}>*</span>} {field.name}
                  </label>
                  <button
                    className="btn btn-secondary dropdown-toggle"
                    type="button"
                    id={\`dropdownMenu-\${field.name}\`}
                    data-bs-toggle="dropdown"
                    aria-haspopup="true"
                    aria-expanded="false"
                  >
                    {dataToSave[field.name]
                      ? options.find((item) => item[field.foreign_field] === dataToSave[field.name])?.[field.foreign_field] || 'Select'
                      : \`Select \${field.name}\`}
                  </button>
                  <div className="dropdown-menu" aria-labelledby={\`dropdownMenu-\${field.name}\`}>
                    <input
                      type="text"
                      className="form-control mb-2"
                      placeholder={\`Search \${field.name}\`}
                      value={searchQueries[field.name] || ''}
                      onChange={(e) => handleSearchChange(field.name, e.target.value)}
                    />
                    
                    {filteredOptions.length > 0 ? (
                      filteredOptions.map((option, i) => (
                        <button
                          key={i}
                          className="dropdown-item"
                          type="button"
                          onClick={() => {
                            setDataToSave({ ...dataToSave, [field.name]: option[field.foreign_field] });
                          }}
                        >
                          {option[field.foreign_field]}
                        </button>
                      ))
                    ) : (
                      <span className="dropdown-item text-muted">No options available</span>
                    )}
                  </div>
                </div>
              );
            } else {
              return (
                <div key={index} style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block' }}>
                    {field.required && <span style={{ color: 'red' }}>*</span>} {field.name}
                  </label>
                  <input
                    type={field.type}
                    name={field.name}
                    required={field.required}
                    placeholder={field.name}
                    value={dataToSave[field.name] || ''}
                    onChange={(e) => setDataToSave({ ...dataToSave, [e.target.name]: e.target.value })}
                    style={{ padding: '5px', width: '100%' }}
                  />
                </div>
              );
            }
          }
          return null;
        })}
        <button className="btn btn-success" onClick={handleCreate}>
          Create
        </button>
      </div>
      {showToast && (
        <div
          className="toast-container position-fixed top-20 start-50 translate-middle p-3"
          style={{ zIndex: 1550 }}
        >
          <div className="toast show" role="alert" aria-live="assertive" aria-atomic="true">
            <div className="toast-header">
              <strong className="me-auto">Success</strong>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="toast"
                aria-label="Close"
                onClick={() => setShowToast(false)}
              ></button>
            </div>
            <div className="toast-body text-success text-center">Created successfully!</div>
          </div>
        </div>
      )}
    </div>`,
  Read: `<div className="container mt-4">
          <table>
            <thead>
              <tr>
                {requiredFields.map((field, index) => (
                  field!=='id' &&<th key={index}>{field}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fetchData.map((item: any, index: number) => (
                <tr key={index}>
                  {requiredFields.map((field, i) => (
                    // <td key={i}>{item[field] || 'N/A'}</td>
                    field!=='id' &&<td key={i}><input type='string' value={item[field]} /></td>
                    
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>`,
  Update: `<div className="container mt-4">
        <table>
          <thead>
            <tr>
              {requiredFields.map((field, index) => (
                field !== 'id' && <th key={index}>{field}</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {fetchData.map((item: any, index: number) => (
              <tr key={index}>
                {requiredFields.map((field, i) => (
                  field !== 'id' && (
                    <td key={i}>
                      <input
                        type='text'
                        value={editedData[item.id]?.[field] || item[field] || ''}
                        // onChange={(e) =>
                        //   handleEdit(item.id, field, e.target.value)
                        // }
                      />
                    </td>
                  )
                ))}
                <td>
                {/* <button onClick={() => handleUpdate(item.id)} className="btn btn-primary">Update</button> */}
                <button onClick={() => handleUpdate(item.id)} className="btn btn-primary">Edit</button>

                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>`,

}


const resourceComponent = async (projectDir: any, resourceName: any, componentPath: any, op: string) => {
  const resourceDirPath = path.join(projectDir, 'src', 'components', 'Resource');
  // const resourceFileName = `${resourceName}Resource.tsx`;
  // const resourceFilePath = path.join(resourceDirPath, resourceFileName);

  if (!fs.existsSync(resourceDirPath)) {
    fs.mkdirSync(resourceDirPath);
  }
  const resourceComponent = `
               ${getImportsAndStates(resourceName,op)}
                
                        
                        return (
                         <div>
                             <div>
                              <h2> ${op+resourceName} </h2>
                             </div>
                            ${operationsDiv[op]}
                            {showToast && (
                              <div
                                className="toast-container position-fixed top-20 start-50 translate-middle p-3"
                                style={{ zIndex: 1550 }}
                              >
                                <div className="toast show" role="alert" aria-live="assertive" aria-atomic="true">
                                  <div className="toast-header">
                                    <strong className="me-auto">Success</strong>
                                    <button
                                      type="button"
                                      className="btn-close"
                                      data-bs-dismiss="toast"
                                      aria-label="Close"
                                      onClick={() => setShowToast(false)}
                                    ></button>
                                  </div>
                                  <div className="toast-body text-success text-center">Created successfully!</div>
                                </div>
                              </div>
                        ) }

                          </div>
                        )
                        
                      
                };

                export default ${op}${resourceName};`;


  fs.writeFileSync(componentPath, resourceComponent);

}

router.post('/createApp', async (req, res) => {
  try {
    const verifyResponse = await verifyJWT(req.session?.accessToken || "");
    var decoded = null;

    if (verifyResponse.valid)
      decoded = verifyResponse.decoded;
    else
      throw verifyResponse.error;
  } catch (error) {
    res.status(500).send('Authentication failed');
  }
  const { content } = req.body;
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  try {
    for (const appData of content) {
      console.log("appData for download: ", appData);
      const project = appData.project;
      const loginPageId = appData.loginPageId;

      const application = await createOrUpdateApplication(project, decoded?.sub);

      const projectDir = path.join(reactAppsDir, project);
      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true });
        //console.log("projectDir deleted");
      }
      await createProjectDirectory(projectDir);
      await copyLoginPages(projectDir);
      await updateLoginTsx(projectDir, loginPageId);


      for (const pageData of appData.pages) {


        let pageObj = new RASPUIPage()
        pageObj.setName(pageData.name)
        let dataWithMapsAndUIItems: DataToReturnType = pageObj.deserializeForDownloadAndSave(pageData)
        // console.log("data returened from deserialization ", dataWithMapsAndUIItems)

        let element: UIItems = dataWithMapsAndUIItems.pageUIItems
        // console.log("each page html content pageUIItems elements: ", element)
        //console.log("each page html content root: ", element.root)
        // if ((element.root as any).Resource) {
        //   var resourceName = (element.root as any).Resource.resourceName;
        //   var resourceOperation = (element.root as any).Resource.selectedOp;
        // }
        // //console.log("resourceName: ", resourceName)
        // //console.log("resourceOperation: ", resourceOperation)

        // element.root.map((element: any) => {

        //   if (element.type == "resource") {
        //     var resourceName = element.resourceName;
        //     var resourceOperation = element.selectedOp;
        //     // resourceComponent(projectDir, resourceName, componentPath, resourceOperation);
        //     //console.log("resourceName: ", resourceName)
        //     //console.log("resourceOperation: ", resourceOperation)
        //   }

        // })
        pageObj.setPageUIItems(element)



        const page = pageData.name;

        // var htmlContent = pageData.html;
        // var htmlContentToSaveToDatabase = pageData.html
        var htmlContentToSaveToDatabase = pageObj.serialize().html;
        var htmlContent = pageObj.getHtml('root');
        //console.log("each page html content: ", htmlContent)

        //updated css with new ids
        const cssData = Object.fromEntries(dataWithMapsAndUIItems.styleMap)
        // const apis = pageData.apis;
        // const componentMap = pageData.component;
        // const apis = new Map(Object.entries(pageData.apis));
        // const componentMap = new Map(Object.entries(pageData.component));

        htmlContent = htmlContent.replace(/,/g, '');

        //saving data to database with the old ids
        const pageResult = await createOrUpdatePage(
          application.id,
          page,
          htmlContentToSaveToDatabase,
          loginPageId,
          pageData.styles,//obj
          pageData.apis,//obj
          pageData.component,//obj
          pageData.resource,
          pageData.operation,
          // apis,
          // componentMap,
        );

        const componentName = page.charAt(0).toUpperCase() + page.slice(1);

        //passing cssData object with the new ids for download
        const cssImportPath = await createCssFile(cssData, componentName, projectDir);

        let fileContent = `
        import React, { useState, useEffect } from 'react';
        import "${cssImportPath}";
        `;

        let cardCount = 0;
        let tableCount = 0;
        const functionArray = [];

        //updated apis map and componentMap with the new ids for download
        const apis = dataWithMapsAndUIItems.apisMap;
        const componentMap = dataWithMapsAndUIItems.compsMap;
        const resourceMap = dataWithMapsAndUIItems.resourceMap;
        const operationMap = dataWithMapsAndUIItems.operationMap;
        // console.log("mppppp:", componentMap)

        for (const item of componentMap) {
          console.log("component map in create app", item[1])
          const value = item[1];

          if (value === 'calendar') {
            fileContent += `import Calendar from "./Calendar/Calendar";`;
            htmlContent = replaceInputsWithCalendar(htmlContent, item[0]);
          } else if (value === 'listingContainer') {
            cardCount += 1;
            const cardName = page + "Card" + cardCount;
            const cardHtml = replaceClassNames(extractCardHtml(htmlContent, item[0]));
            htmlContent = removeCardHtml(htmlContent, item[0]);

            const jsxContent = `{data.map((product, index) => (
              <${cardName} key={index} product={product} />
            ))}`;

            htmlContent = htmlContent.replace(`PLACEHOLDERCONTENT`, jsxContent);

            const cardComponentPath = path.join(projectDir, 'src', 'components', `${cardName}.tsx`);
            const cardComponentContent = `
              import React from 'react';
              import "${cssImportPath}";

              interface ${cardName}Props {
                product: any;
              }

              const ${cardName}: React.FC<${cardName}Props> = ({ product }) => {
                return (
                  <>
                  ${cardHtml}
                  </>
                );
              }

              export default ${cardName};
            `;
            await fs.outputFile(cardComponentPath, cardComponentContent);
            await replacePropsWithProduct(cardComponentPath);
            await replaceProductKeys(cardComponentPath);

            fileContent += `
              import ${cardName} from "./${cardName}";
              import use${componentName}Hook from '../hooks/use${componentName}Hook';
            `;

            const apiName = apis.get(item[0]);
            await createModelFile(projectDir, componentName, apiName);
            await createHookFile(projectDir, componentName, apiName);

            functionArray.push(
              `const {data} = use${componentName}Hook();`
            );
          } else if (value === "table") {
            tableCount += 1;
            const apiName = apis.get(item[0]);
            htmlContent = removeCardHtml(htmlContent, item[0]);

            await createHookTableFile(projectDir, componentName, apiName, tableCount);
            await createTableFile(projectDir, componentName, tableCount)
            console.log("after clean html", htmlContent);
            htmlContent = htmlContent.replace(`PLACEHOLDERCONTENT`, `<${componentName}${tableCount}Table/>`);
            console.log("after replace html", htmlContent);

            fileContent += `
            import ${componentName}${tableCount}Table from '../tables/${componentName}${tableCount}Table';
            `
          }
          else if (value === 'resource') {
            const resourceName = resourceMap.get(item[0]);
            const resourceOperationName = operationMap.get(item[0]);
            // console.log("resource name and resource operation: ", resourceName,resourceOperationName);
            htmlContent = removeCardHtml(htmlContent, item[0]);

            const componentPath = path.join(projectDir, 'src', 'components', 'Resource', `${resourceOperationName}${resourceName}.tsx`);
            resourceComponent(projectDir, resourceName, componentPath, resourceOperationName);
            htmlContent = htmlContent.replace(`PLACEHOLDERCONTENT`, `<${resourceOperationName}${resourceName}/>`);

            fileContent += `
            import ${resourceOperationName}${resourceName} from './Resource/${resourceOperationName}${resourceName}';
            `

          }
        }

        htmlContent = replaceClassNames(htmlContent);

        fileContent += `export default function ${componentName}() {
          ${functionArray.join('\n\n')}

          return (
            <>
            ${htmlContent}
            </>
          );
        }`;

        const componentPath = path.join(projectDir, 'src', 'components', `${componentName}.tsx`);
        await fs.outputFile(componentPath, fileContent);

        const loginPageAdded = !!loginPageId;
        await updateAppJs(projectDir, componentName, page, loginPageAdded);
      }

      //console.log('App created successfully ', res);
      createAndDownloadZip(path.join(reactAppsDir, project), project, res);
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Error processing request');
  }
});


router.post('/download', async (req, res) => {
  try {
    const verifyResponse = await verifyJWT(req.session?.accessToken || "");
    var decoded = null;

    if (verifyResponse.valid) decoded = verifyResponse.decoded;
    else throw verifyResponse.error;
  } catch (error) {
    res.status(500).send("Authentication failed");
    return;
  }

  const { content } = req.body;
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  const parsedContent = JSON.parse(content);
  console.log("parsedContent", parsedContent);

  try {

    const App = await getApplication(parsedContent.name);

    if (!App) {
      throw new Error("Application not found");
    }
    const ApplicationPages = await getAllPagesOfApplication(App.name, decoded?.sub);

    const project = App.name;
    const loginPageId = parsedContent.loginPageId;

    // const application = await createOrUpdateApplication(project, "bd9788c8-10d7-4d29-8c16-052962d9c64f");

    const projectDir = path.join(reactAppsDir, project);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true });
      //console.log("projectDir deleted");
    }
    await createProjectDirectory(projectDir);
    await copyLoginPages(projectDir);
    await updateLoginTsx(projectDir, loginPageId);



    const pages = Array.isArray(ApplicationPages) ? ApplicationPages : JSON.parse(ApplicationPages || "[]");
    // //console.log("pages", pages);

    for (const pageData of pages) {
      const pageObj = new RASPUIPage();
      pageObj.setName(pageData.pageName);

      const page = pageData.pageName;
      const dataWithMapsAndUIItems = pageObj.deserializeForDownload(pageData.pageContent);

      var htmlContent = pageObj.getHtml("root");

      //console.log("htmlContent=", htmlContent);
      // Updated CSS with new IDs
      const cssData = Object.fromEntries(dataWithMapsAndUIItems.styleMap);

      const componentName = pageData.pageName.charAt(0).toUpperCase() + pageData.pageName.slice(1);

      // Passing CSS data object with the new IDs for download
      const cssImportPath = await createCssFile(cssData, componentName, projectDir);

      // Generate component content
      let fileContent = `
        import React, { useState, useEffect } from 'react';
        import "${cssImportPath}";
        `;

      let cardCount = 0;
      let tableCount = 0;
      const functionArray = [];


      //updated apis map and componentMap with the new ids for download
      const apis = dataWithMapsAndUIItems.apisMap;
      const componentMap = dataWithMapsAndUIItems.compsMap;
      const resourceMap = dataWithMapsAndUIItems.resourceMap;
      const operationMap = dataWithMapsAndUIItems.operationMap;

      for (const item of componentMap) {
        //console.log("component map in create app", item[1])
        const value = item[1];

        if (value === 'calendar') {
          fileContent += `import Calendar from "./Calendar/Calendar";`;
          htmlContent = replaceInputsWithCalendar(htmlContent, item[0]);
        } else if (value === 'listingContainer') {
          cardCount += 1;
          const cardName = page + "Card" + cardCount;
          const cardHtml = replaceClassNames(extractCardHtml(htmlContent, item[0]));
          htmlContent = removeCardHtml(htmlContent, item[0]);

          const jsxContent = `{data.map((product, index) => (
              <${cardName} key={index} product={product} />
            ))}`;

          htmlContent = htmlContent.replace(`PLACEHOLDERCONTENT`, jsxContent);

          const cardComponentPath = path.join(projectDir, 'src', 'components', `${cardName}.tsx`);
          const cardComponentContent = `
              import React from 'react';
              import "${cssImportPath}";

              interface ${cardName}Props {
                product: any;
              }

              const ${cardName}: React.FC<${cardName}Props> = ({ product }) => {
                return (
                  <>
                  ${cardHtml}
                  </>
                );
              }

              export default ${cardName};
            `;
          await fs.outputFile(cardComponentPath, cardComponentContent);
          await replacePropsWithProduct(cardComponentPath);
          await replaceProductKeys(cardComponentPath);

          fileContent += `
              import ${cardName} from "./${cardName}";
              import use${componentName}Hook from '../hooks/use${componentName}Hook';
            `;

          const apiName = apis.get(item[0]);
          await createModelFile(projectDir, componentName, apiName);
          await createHookFile(projectDir, componentName, apiName);

          functionArray.push(
            `const {data} = use${componentName}Hook();`
          );
        } else if (value === "table") {
          tableCount += 1;
          const apiName = apis.get(item[0]);
          htmlContent = removeCardHtml(htmlContent, item[0]);

          await createHookTableFile(projectDir, componentName, apiName, tableCount);
          await createTableFile(projectDir, componentName, tableCount)

          htmlContent = htmlContent.replace(`PLACEHOLDERCONTENT`, `<${componentName}${tableCount}Table/>`);

          fileContent += `
            import ${componentName}${tableCount}Table from '../tables/${componentName}${tableCount}Table';
            `
        }
        else if (value === 'resource') {
          const resourceName = resourceMap.get(item[0]);
          const resourceOperationName = operationMap.get(item[0]);
          // console.log("resource name and resource operation: ", resourceName,resourceOperationName);
          htmlContent = removeCardHtml(htmlContent, item[0]);

          const componentPath = path.join(projectDir, 'src', 'components', 'Resource', `${resourceOperationName}${resourceName}.tsx`);
          resourceComponent(projectDir, resourceName, componentPath, resourceOperationName);
          htmlContent = htmlContent.replace(`PLACEHOLDERCONTENT`, `<${resourceOperationName}${resourceName}/>`);

          fileContent += `
          import ${resourceOperationName}${resourceName} from './Resource/${resourceOperationName}${resourceName}';
          `

        }


      }

      htmlContent = replaceClassNames(htmlContent);

      fileContent += `export default function ${componentName}() {
          ${functionArray.join('\n\n')}

          return (
            <>
            ${htmlContent}
            </>
          );
        }`;

      const componentPath = path.join(projectDir, 'src', 'components', `${componentName}.tsx`);
      await fs.outputFile(componentPath, fileContent);

      const loginPageAdded = !!loginPageId;
      await updateAppJs(projectDir, componentName, page, loginPageAdded);
    }

    // //console.log("App created successfully in download react dir", reactAppsDir);
    // //console.log("App created successfully in download project", project);
    //console.log("App created successfully in download res", res);

    createAndDownloadZip(path.join(reactAppsDir, project), project, res);

  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing request");
  }
});

router.post('/saveApp', async (req, res) => {
  try {
    const verifyResponse = await verifyJWT(req.session?.accessToken || "");

    var decoded = null;

    if (verifyResponse.valid)
      decoded = verifyResponse.decoded;
    else
      throw verifyResponse.error;
  } catch (error) {
    res.status(500).send('Authentication failed');
  }

  const { content } = req.body;
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  try {
    for (const appData of content) {
      const project = appData.project;
      const loginPageId = appData.loginPageId;

      const application = await createOrUpdateApplication(project, decoded?.sub);
      for (const pageData of appData.pages) {
        //console.log("pageData in saveApp", pageData);

        const page = pageData.name;
        const htmlContent = pageData.html;
        const cssData = pageData.styles;
        const apis = pageData.apis;
        const componentMap = pageData.component;
        const resourceMap = pageData.resource;
        const operationMap = pageData.operation;

        const pageResult = await createOrUpdatePage(
          application.id,
          page,
          htmlContent,
          loginPageId,
          cssData,
          apis,
          componentMap,
          resourceMap,
          operationMap
        );
      }
    }

    res.status(200).send('All applications and pages saved successfully in the database');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error saving applications and pages in the database');
  }
});

router.get('/flightlist', async (req, res) => {
  // res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
  // res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  // res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // res.setHeader("Access-Control-Allow-Credentials", true);

  try {
    // const verifyResponse = await verifyJWT(req.session?.accessToken || "");

    // var decoded = null;

    // if (verifyResponse.valid)
    //   decoded = verifyResponse.decoded;
    // else
    //   throw verifyResponse.error;

    res.json(todoListData);
  } catch (error) {
    res.status(500).send('Authentication failed');
  }
});

router.get('/flightlist1', async (req, res) => {
  // res.setHeader("Access-Control-Allow-Origin", '*');
  // res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  // res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // res.setHeader("Access-Control-Allow-Credentials", 'true');

  try {
    // const verifyResponse = await verifyJWT(req.session?.accessToken || "");

    // var decoded = null;

    // if (verifyResponse.valid)
    //   decoded = verifyResponse.decoded;
    // else
    //   throw verifyResponse.error;
    //console.log(todoListData);
    res.json(todoListData);
  } catch (error) {
    res.status(500).send('Authentication failed.....');
  }
});

router.get('/applications/:userId', async (req, res) => {
  try {
    const verifyResponse = await verifyJWT(req.session?.accessToken || "");

    var decoded = null;

    if (verifyResponse.valid)
      decoded = verifyResponse.decoded;
    else
      throw verifyResponse.error;
  } catch (error) {
    res.status(500).send('Authentication failed');
  }

  const userId = req.params.userId;

  try {
    const applications = await getAllApplications(userId);

    res.status(200).json({
      success: true,
      data: applications
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get('/getPageData/:userId/:applicationName/:pageName', async (req, res) => {
  try {
    const verifyResponse = await verifyJWT(req.session?.accessToken || "");

    var decoded = null;

    if (verifyResponse.valid)
      decoded = verifyResponse.decoded;
    else
      throw verifyResponse.error;
  } catch (error) {
    res.status(500).send('Authentication failed');
  }

  try {
    const { userId, applicationName, pageName } = req.params;

    const pageData = await getPageData(applicationName, pageName, userId);

    res.status(200).json({ message: 'Page data retrieved successfully', pageData });
  } catch (error: any) {
    console.error("Error fetching page data: ", error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/createCustomComponent', async (req, res) => {
  try {
    const verifyResponse = await verifyJWT(req.session?.accessToken || "");

    var decoded = null;

    if (verifyResponse.valid)
      decoded = verifyResponse.decoded;
    else
      throw verifyResponse.error;
  } catch (error) {
    res.status(500).send('Authentication failed');
  }
  const { userId, componentName, componentContent } = req.body;

  try {
    const result = await createOrUpdateCustomComponent(userId, componentName, componentContent);
    res.status(200).json({ message: 'Custom component saved successfully', result });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to save custom component', error: error.message });
  }
});

router.get('/customComponents/:userId', async (req, res) => {
  try {
    const verifyResponse = await verifyJWT(req.session?.accessToken || "");

    var decoded = null;

    if (verifyResponse.valid)
      decoded = verifyResponse.decoded;
    else
      throw verifyResponse.error;
  } catch (error) {
    res.status(500).send('Authentication failed');
  }
  const { userId } = req.params;

  try {
    const components = await getCustomComponentsByUserId(userId);
    res.status(200).json({ success: true, data: components });
  } catch (error: any) {
    console.error('Error retrieving custom components:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/customComponent/:userId/:componentName', async (req, res) => {
  try {
    const verifyResponse = await verifyJWT(req.session?.accessToken || "");

    var decoded = null;

    if (verifyResponse.valid)
      decoded = verifyResponse.decoded;
    else
      throw verifyResponse.error;
  } catch (error) {
    res.status(500).send('Authentication failed');
  }
  const { userId, componentName } = req.params;


  try {
    const customComponent = await getCustomComponent(userId, componentName);
    if (customComponent) {
      res.status(200).json({ message: 'Custom component retrieved successfully', customComponent });
    } else {
      res.status(404).json({ message: 'Custom component not found' });
    }
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to fetch custom component', error: error.message });
  }
});

router.get('/pages/:userId/:applicationName', async (req, res) => {
  try {
    const verifyResponse = await verifyJWT(req.session?.accessToken || "");

    var decoded = null;

    if (verifyResponse.valid)
      decoded = verifyResponse.decoded;
    else
      throw verifyResponse.error;
  } catch (error) {
    res.status(500).send('Authentication failed');
  }
  const { userId, applicationName } = req.params;

  try {
    const pages = await getAllPagesOfApplication(applicationName, userId);

    res.status(200).json({
      success: true,
      data: pages,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export = router;