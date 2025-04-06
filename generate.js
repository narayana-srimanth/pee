const fs = require('fs');
const ejs = require('ejs');
const path = require('path');

//hard coded user input
const userInput = {
    componentName: 'MyComponent',
    props: 'title, description',
    innerJSX: '<h1>{title}</h1><p>{description}</p>'
};

// Read EJS template
const templatePath = path.join(__dirname, 'react-template.ejs');
fs.readFile(templatePath, 'utf-8', (err, template) => {
    if (err) {
        console.error('Error reading template:', err);
        return;
    }

    // Render the React component using EJS
    const componentCode = ejs.render(template, {
        componentName: userInput.componentName,
        propsList: userInput.props,
        innerJSX: userInput.innerJSX
    });

    // Save to a new React component file
    const outputPath = path.join(__dirname, `${userInput.componentName}.jsx`);
    fs.writeFile(outputPath, componentCode, (err) => {
        if (err) {
            console.error('Error writing file:', err);
        } else {
            console.log(`Component ${userInput.componentName}.jsx generated successfully!`);
        }
    });
});
