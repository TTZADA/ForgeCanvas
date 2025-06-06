import { NativeFunction, ArgType } from '@tryforge/forgescript';
import { FillOrStroke } from '../..';
declare const _default: NativeFunction<[{
    name: string;
    description: string;
    type: ArgType.String;
    required: false;
    rest: false;
}, {
    name: string;
    description: string;
    type: ArgType.Enum;
    enum: typeof FillOrStroke;
    required: true;
    rest: false;
}, {
    name: string;
    description: string;
    type: ArgType.String;
    required: true;
    rest: false;
}, {
    name: string;
    description: string;
    type: ArgType.String;
    check: (i: string) => boolean;
    required: true;
    rest: false;
}, {
    name: string;
    description: string;
    type: ArgType.String;
    required: true;
    rest: false;
}, {
    name: string;
    description: string;
    type: ArgType.Number;
    required: true;
    rest: false;
}, {
    name: string;
    description: string;
    type: ArgType.Number;
    required: true;
    rest: false;
}, , {
    name: string;
    description: string;
    type: ArgType.Number;
    required: false;
    rest: false;
}, {
    name: string;
    description: string;
    type: ArgType.Number;
    required: false;
    rest: false;
}, {
    name: string;
    description: string;
    type: ArgType.Boolean;
    required: false;
    rest: false;
}, {
    name: string;
    description: string;
    type: ArgType.Boolean;
    required: false;
    rest: false;
}, {
    name: string;
    description: string;
    type: ArgType.Number;
    required: false;
    rest: false;
}], true>;
export default _default;
