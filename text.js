const fs = require('fs');

const packageJsonPath = './package.json';
const keyToRemove = 'scripts';

// Read the contents of package.json
fs.readFile(packageJsonPath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading package.json:', err);
    return;
  }

  try {
    // Parse the JSON data
    const packageJson = JSON.parse(data);

    // Remove the specified key
    delete packageJson[keyToRemove];

    // Convert the updated object back to JSON
    const updatedPackageJson = JSON.stringify(packageJson, null, 2);

    // Write the updated package.json file
    fs.writeFile(packageJsonPath, updatedPackageJson, 'utf8', (err) => {
      if (err) {
        console.error('Error writing package.json:', err);
        return;
      }
      console.log(`Successfully removed "${keyToRemove}" from package.json.`);
    });
  } catch (err) {
    console.error('Error parsing package.json:', err);
  }
});
