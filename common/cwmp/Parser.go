package cwmp

import (
	"errors"

	"github.com/ca17/teamsacs/common/xmlx"
)

// ParseXML parse xml msg
func ParseXML(data []byte) (msg Message, err error) {
	doc := xmlx.New()
	err = doc.LoadBytes(data, nil)
	if err != nil {
		return nil, err
	}
	bodyNode := doc.SelectNode("*", "Body")
	if bodyNode != nil {
		// Find the first element child node (skip text/whitespace nodes)
		var name string
		for _, child := range bodyNode.Children {
			if child.Type == xmlx.NT_ELEMENT && child.Name.Local != "" {
				name = child.Name.Local
				break
			}
		}
		if name == "" {
			return nil, errors.New("no element found in SOAP Body")
		}
		switch name {
		case "Inform":
			msg = NewInform()
		case "GetParameterValuesResponse":
			msg = &GetParameterValuesResponse{}
		case "SetParameterValuesResponse":
			msg = &SetParameterValuesResponse{}
		case "GetParameterNames":
			msg = &GetParameterNames{}
		case "GetParameterNamesResponse":
			msg = &GetParameterNamesResponse{}
		case "DownloadResponse":
			msg = &DownloadResponse{}
		case "UploadResponse":
			msg = &UploadResponse{}
		case "TransferComplete":
			msg = &TransferComplete{}
		case "GetRPCMethodsResponse":
			msg = &GetRPCMethodsResponse{}
		case "RebootResponse":
			msg = &RebootResponse{}
		case "FactoryResetResponse":
			msg = &FactoryResetResponse{}
		case "ScheduleInform":
			msg = &ScheduleInform{}
		case "ScheduleInformResponse":
			msg = &ScheduleInformResponse{}
		default:
			return nil, errors.New("no msg type match: " + name)
		}
		if msg != nil {
			msg.Parse(doc)
		}
	}
	return msg, err
}
