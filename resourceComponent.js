import fs from 'fs';
import path from 'path';
import ejs from 'ejs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getImportsAndStates = async (resName, operation) => {
    let templatePath;
    if(operation === "Create") templatePath = path.join(__dirname, "templates", "createGetStates.ejs");
    else if(operation === "Read") templatePath = path.join(__dirname, "templates", "readGetStates.ejs");
    else if(operation === "Update") templatePath = path.join(__dirname, "templates", "updateGetStates.ejs");
  
    try {
      return await ejs.renderFile(templatePath, { 
        resName, 
        operation,
        apiConfig: {
          getResourceUrl: (resource) => `/api/${resource}`,
          getResourceMetaDataUrl: (resource) => `/api/${resource}/metadata`,
          API_BASE_URL: '/api'
        },
        fields: [],
        fetchData: [],
        foreignkeyData: {},
        searchQueries: {},
        dataToSave: {},
        regex: /^(g_|archived|extra_data)/,
        selectedItem: null
      });
    } catch (err) {
      console.error(`Error rendering ${operation}GetStates.ejs:`, err);
      return "";
    }
};

const getOperationsDiv = async (operation) => {
  let templatePath;
  if(operation === "Create") templatePath = path.join(__dirname, "templates", "createOperationsDiv.ejs");
  else if(operation === "Read") templatePath = path.join(__dirname, "templates", "readOperationsDiv.ejs");
  else if(operation === "Update") templatePath = path.join(__dirname, "templates", "updateOperationsDiv.ejs");
  
  try {
    return await ejs.renderFile(templatePath, { 
      operation,
      fields: [],
      fetchData: [],
      foreignkeyData: {},
      searchQueries: {},
      dataToSave: {},
      regex: /^(g_|archived|extra_data)/,
      selectedItem: null
    });
  } catch (err) {
    console.error(`Error rendering ${operation}OperationsDiv.ejs:`, err);
    return "";
  }
};

const generateResourceComponent = async (resourceName, operation) => {
    try {
        // Get the imports and states section
        const importsAndStates = await getImportsAndStates(resourceName, operation);
        
        // Get the operations div section
        const operationsDiv = await getOperationsDiv(operation);
        
        // Generate the final component
        const templatePath = path.join(__dirname, "templates", "resourceComponentTemplate.ejs");
        const componentPath = path.join(__dirname, `${operation}${resourceName}.tsx`);
        
        const result = await ejs.renderFile(templatePath, {
            componentName: `${operation}${resourceName}`,
            resName: resourceName,
            operation: operation,
            importsAndStates,
            operationsDiv
        });
        
        fs.writeFileSync(componentPath, result);
        console.log(`Component ${operation}${resourceName} created successfully.`);
    } catch (err) {
        console.error("Error generating resource component:", err);
    }
};

// Example usage
generateResourceComponent("User", "Create");
generateResourceComponent("User", "Read");
generateResourceComponent("User", "Update");