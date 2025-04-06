import React, { useState, useEffect } from 'react';

export type resourceMetaData = {
  resource: string;
  fieldValues: any[];
};

const CreateUser = () => {
  const [resMetaData, setResMetaData] = useState<resourceMetaData[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [dataToSave, setDataToSave] = useState<any>({});
  const [showToast, setShowToast] = useState<any>(false);
  const [foreignkeyData, setForeignkeyData] = useState<Record<string, any[]>>({});
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const regex = /^(g_|archived|extra_data)/;
  const apiUrl = '/api/user?';
  const metadataUrl = '/api/User/metadata?';

  useEffect(() => {
    const fetchResMetaData = async () => {
      const fetchedResources = new Set();
      console.log("Fetched resources", fetchedResources);
      try {
        const data = await fetch(metadataUrl, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (data.ok) {
          const metaData = await data.json();
          setResMetaData(metaData);
          setFields(metaData[0].fieldValues);
          const foreignFields = metaData[0].fieldValues.filter((field: any) => field.foreign);
          console.log("Foreign fields", foreignFields);
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

  useEffect(() => {
    console.log("Data to save", dataToSave);
  }, [dataToSave]);

  const fetchForeignData = async (foreignResource: string, fieldName: string, foreignField: string) => {
    try {
      const params = new URLSearchParams();
      const ssid: any = sessionStorage.getItem('key');
      params.append('queryId', 'GET_ALL');
      params.append('session_id', ssid);

      const response = await fetch(
        `/api/${foreignResource.toLowerCase()}?${params.toString()}`,
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
        console.error(`Error fetching foreign data for ${fieldName}:`, response.status);
      }
    } catch (error) {
      console.error(`Error fetching foreign data for ${fieldName}:`, error);
    }
  };

  const handleCreate = async () => {
    const params = new URLSearchParams();
    const jsonString = JSON.stringify(dataToSave);
    const base64Encoded = btoa(jsonString);
    params.append('resource', base64Encoded);
    const ssid: any = sessionStorage.getItem('key');
    params.append('session_id', ssid);

    const response = await fetch(apiUrl + params.toString(), {
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

return (
  <div>
    <div>
      <h2>CreateUser</h2>
    </div>
    <div>
  <div className="container mt-4">
    {fields.map((field, index) => {
      if (field.name !== 'id' && !regex.test(field.name)) {
        if (field.foreign) {
          const options = foreignkeyData[field.foreign] || [];
          const filteredOptions = options.filter((option) =>
            option[field.foreign_field].toLowerCase().includes((searchQueries[field.name] || '').toLowerCase())
          );
          return (
            <div key={index} className="dropdown">
              <label style={{ display: 'block' }}>
                {field.required && <span style={{ color: 'red' }}>*</span>} {field.name}
              </label>
              <button
                className="btn btn-secondary dropdown-toggle"
                type="button"
                id={`dropdownMenu-${field.name}`}
                data-bs-toggle="dropdown"
                aria-haspopup="true"
                aria-expanded="false"
              >
                {dataToSave[field.name]
                  ? options.find((item) => item[field.foreign_field] === dataToSave[field.name])?.[field.foreign_field] || 'Select'
                  : `Select ${field.name}`}
              </button>
              <div className="dropdown-menu" aria-labelledby={`dropdownMenu-${field.name}`}>
                <input
                  type="text"
                  className="form-control mb-2"
                  placeholder={`Search ${field.name}`}
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
          <div className="toast-body text-success text-center">Operation completed successfully!</div>
        </div>
      </div>
    )}
  </div>
);

};

export default CreateUser;