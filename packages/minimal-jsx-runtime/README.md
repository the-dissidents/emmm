# minimal-jsx-runtime

Implements `jsx`, `jsxs` and `Fragment` using simple vanilla DOM API.

## Usage

1. Add to dependency (Not dev-dependency). You can simply copy it to your project directory and add it locally, e.g. in `package.json`:
   ```
   "dependencies": {
      "minimal-jsx-runtime": "file:../minimal-jsx-runtime"
   }
   ```
2. In `tsconfig.json`, set
   ```
   "jsx": "react-jsx",
   "jsxImportSource": "minimal-jsx-runtime"
   ```
3. Done