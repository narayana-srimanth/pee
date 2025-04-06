import React, { useState } from 'react';
import { useEffect } from 'react';
import { useNavigate } from "react-router-dom";

export type ResourceMetaData = {
  "resource": string,
  "fieldValues": any[]
}

const UpdateUser = () => {
  const [resMetaData, setResMetaData] = useState<ResourceMetaData[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [requiredFields, setRequiredFields] = useState<string[]>([]);
  const [fetchData, setFetchedData] = useState<any[]>([]);
  const [editedData, setEditedData] = useState<any>({});
  const [showToast,setShowToast] = useState<any>(false);
  const navigate = useNavigate();
  const regex = /^(g_|archived|extra_data)/;
  const apiUrl = '/api/user?'
  const metadataUrl = '/api/User/metadata?'
  const BaseUrl = '/api';

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
    navigate('/edit',{state:{id:id,editedData:editedData,resName:'User',currUrl:currentUrl,apiUrl:apiUrl.toString(),metadataUrl:metadataUrl.toString(),BaseUrl:BaseUrl.toString()}});
  };

return (
  <div>
    <div>
      <h2>UpdateUser</h2>
    </div>
    <div className="container mt-4">
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

export default UpdateUser;