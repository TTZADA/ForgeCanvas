import { NativeFunction, ArgType } from '@tryforge/forgescript';
declare const _default: NativeFunction<[{
    name: string;
    description: string;
    type: ArgType.String;
    required: false;
    rest: false;
}, {
    name: string;
    description: string;
    type: ArgType.String;
    required: true;
    rest: false;
}, {
    name: number;
    description: number;
    type: ArgType.Number;
    required: false;
    rest: false;
}], true>;
export default _default;
