/*

 Visual Blocks Editor

 Copyright 2016 Google Inc.
 https://developers.google.com/blockly/

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/
Blockly.constants={};Blockly.DRAG_RADIUS=3;Blockly.FLYOUT_DRAG_RADIUS=10;Blockly.SNAP_RADIUS=48;Blockly.CONNECTING_SNAP_RADIUS=68;Blockly.CURRENT_CONNECTION_PREFERENCE=20;Blockly.BUMP_DELAY=0;Blockly.COLLAPSE_CHARS=30;Blockly.LONGPRESS=750;Blockly.LINE_SCROLL_MULTIPLIER=15;Blockly.SOUND_LIMIT=100;Blockly.DRAG_STACK=!0;Blockly.HSV_SATURATION=.45;Blockly.HSV_VALUE=.65;Blockly.SPRITE={width:96,height:124,url:"sprites.png"};Blockly.SVG_NS="http://www.w3.org/2000/svg";Blockly.HTML_NS="http://www.w3.org/1999/xhtml";
Blockly.INPUT_VALUE=1;Blockly.OUTPUT_VALUE=2;Blockly.NEXT_STATEMENT=3;Blockly.PREVIOUS_STATEMENT=4;Blockly.DUMMY_INPUT=5;Blockly.ALIGN_LEFT=-1;Blockly.ALIGN_CENTRE=0;Blockly.ALIGN_RIGHT=1;Blockly.DRAG_NONE=0;Blockly.DRAG_STICKY=1;Blockly.DRAG_BEGIN=1;Blockly.DRAG_FREE=2;Blockly.OPPOSITE_TYPE=[];Blockly.OPPOSITE_TYPE[Blockly.INPUT_VALUE]=Blockly.OUTPUT_VALUE;Blockly.OPPOSITE_TYPE[Blockly.OUTPUT_VALUE]=Blockly.INPUT_VALUE;Blockly.OPPOSITE_TYPE[Blockly.NEXT_STATEMENT]=Blockly.PREVIOUS_STATEMENT;
Blockly.OPPOSITE_TYPE[Blockly.PREVIOUS_STATEMENT]=Blockly.NEXT_STATEMENT;Blockly.TOOLBOX_AT_TOP=0;Blockly.TOOLBOX_AT_BOTTOM=1;Blockly.TOOLBOX_AT_LEFT=2;Blockly.TOOLBOX_AT_RIGHT=3;Blockly.OUTPUT_SHAPE_HEXAGONAL=1;Blockly.OUTPUT_SHAPE_ROUND=2;Blockly.OUTPUT_SHAPE_SQUARE=3;Blockly.Categories={motion:"motion",looks:"looks",sound:"sounds",pen:"pen",data:"data",dataLists:"data-lists",event:"events",control:"control",sensing:"sensing",interpolation:"interpolation",operators:"operators",more:"more"};
Blockly.DELETE_AREA_NONE=null;Blockly.DELETE_AREA_TRASH=1;Blockly.DELETE_AREA_TOOLBOX=2;Blockly.VARIABLE_CATEGORY_NAME="VARIABLE";Blockly.PROCEDURE_CATEGORY_NAME="PROCEDURE";Blockly.LIST_CATEGORY_NAME="LIST";Blockly.RENAME_VARIABLE_ID="RENAME_VARIABLE_ID";Blockly.DELETE_VARIABLE_ID="DELETE_VARIABLE_ID";Blockly.NEW_BROADCAST_MESSAGE_ID="NEW_BROADCAST_MESSAGE_ID";Blockly.BROADCAST_MESSAGE_VARIABLE_TYPE="broadcast_msg";Blockly.LIST_VARIABLE_TYPE="list";Blockly.SCALAR_VARIABLE_TYPE="";
Blockly.PROCEDURES_DEFINITION_BLOCK_TYPE="procedures_definition";Blockly.PROCEDURES_PROTOTYPE_BLOCK_TYPE="procedures_prototype";Blockly.PROCEDURES_CALL_BLOCK_TYPE="procedures_call";Blockly.PROCEDURES_CALL_WITH_RETURN_BLOCK_TYPE="procedures_call_with_return";Blockly.PROCEDURES_RUN_BRANCH_BLOCK_TYPE="procedures_run_branch";Blockly.PROCEDURES_BRANCH_EDITOR_BLOCK_TYPE="procedures_branch_editor";Blockly.PROCEDURES_BRANCH_ARGUMENT_BLOCK_TYPE="argument_reporter_branch";
Blockly.PROCEDURES_BRANCH_ARGUMENT_EDITOR_BLOCK_TYPE="argument_editor_branch";Blockly.PROCEDURES_BRANCH_INPUT_PREFIX="SUBSTACK";Blockly.StatusButtonState={READY:"ready",NOT_READY:"not ready"};/*

 Visual Blocks Editor

 Copyright 2012 Google Inc.
 https://developers.google.com/blockly/

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/
Blockly.Blocks.colour={};function randomColour(){return"#"+("00000"+Math.floor(Math.random()*16777216).toString(16)).substr(-6)}Blockly.Blocks.colour_picker={init:function(){this.jsonInit({message0:"%1",args0:[{type:"field_colour_slider",name:"COLOUR",colour:randomColour()}],outputShape:Blockly.OUTPUT_SHAPE_ROUND,output:"Colour"})}};/*

 Visual Blocks Editor

 Copyright 2016 Massachusetts Institute of Technology
 All rights reserved.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/
Blockly.Colours={motion:{primary:"#4C97FF",secondary:"#4280D7",tertiary:"#3373CC"},looks:{primary:"#9966FF",secondary:"#855CD6",tertiary:"#774DCB"},sounds:{primary:"#CF63CF",secondary:"#C94FC9",tertiary:"#BD42BD"},control:{primary:"#FFAB19",secondary:"#EC9C13",tertiary:"#CF8B17"},event:{primary:"#FFBF00",secondary:"#E6AC00",tertiary:"#CC9900"},interpolation:{primary:"#12B0C9",secondary:"#0F9DB4",tertiary:"#0D8A9E",gradient:"#1C78B5"},sensing:{primary:"#5CB1D6",secondary:"#47A8D1",tertiary:"#2E8EB8"},
pen:{primary:"#0fBD8C",secondary:"#0DA57A",tertiary:"#0B8E69"},operators:{primary:"#59C059",secondary:"#46B946",tertiary:"#389438"},data:{primary:"#FF8C1A",secondary:"#FF8000",tertiary:"#DB6E00"},data_lists:{primary:"#FF661A",secondary:"#FF5500",tertiary:"#E64D00"},more:{primary:"#FF6680",secondary:"#FF4D6A",tertiary:"#FF3355"},text:"#575E75",workspace:"#F9F9F9",toolboxHover:"#4C97FF",toolboxSelected:"#e9eef2",toolboxText:"#575E75",toolbox:"#FFFFFF",flyout:"#F9F9F9",scrollbar:"#CECDCE",scrollbarHover:"#CECDCE",
textField:"#FFFFFF",insertionMarker:"#000000",insertionMarkerOpacity:.2,dragShadowOpacity:.3,stackGlow:"#FFF200",stackGlowSize:4,stackGlowOpacity:1,replacementGlow:"#FFFFFF",replacementGlowSize:2,replacementGlowOpacity:1,colourPickerStroke:"#FFFFFF",fieldShadow:"rgba(0,0,0,0.1)",dropDownShadow:"rgba(0, 0, 0, .3)",numPadBackground:"#547AB2",numPadBorder:"#435F91",numPadActiveBackground:"#435F91",numPadText:"white",valueReportBackground:"#FFFFFF",valueReportBorder:"#AAAAAA"};
Blockly.Colours.overrideColours=function(a){if(a)for(var b in a)if(a.hasOwnProperty(b)&&Blockly.Colours.hasOwnProperty(b)){var c=a[b];if(typeof c=="object"&&c!==null||typeof c=="function"){c.primary&&!c.hasOwnProperty("gradient")&&delete Blockly.Colours[b].gradient;for(var e in c)c.hasOwnProperty(e)&&(Blockly.Colours[b].hasOwnProperty(e)||e==="gradient")&&(Blockly.Colours[b][e]=c[e])}else Blockly.Colours[b]=c}};Blockly.Colours.isHex=function(a){return typeof a=="string"&&/^#[0-9a-fA-F]{6}$/.test(a)};
Blockly.Colours.shadesOf=function(a){var b=Blockly.Colours.hexToHsl_(a);return{primary:a.toUpperCase(),secondary:Blockly.Colours.hslToHex_(b[0],b[1],b[2]-.06),tertiary:Blockly.Colours.hslToHex_(b[0],b[1],b[2]-.12)}};
Blockly.Colours.hexToHsl_=function(a){var b=parseInt(a.substr(1,2),16)/255,c=parseInt(a.substr(3,2),16)/255;a=parseInt(a.substr(5,2),16)/255;var e=Math.max(b,c,a),f=Math.min(b,c,a),g=(e+f)/2;if(e==f)return[0,0,g];var d=e-f;return[(e==b?(c-a)/d+(c<a?6:0):e==c?(a-b)/d+2:(b-c)/d+4)*60,g>.5?d/(2-e-f):d/(e+f),g]};
Blockly.Colours.hslToHex_=function(a,b,c){a=(a%360+360)%360/360;b=Math.min(1,Math.max(0,b));c=Math.min(1,Math.max(0,c));if(b==0)b=c=a=c;else{var e=c<.5?c*(1+b):c+b-c*b,f=2*c-e,g=function(d){d<0&&(d+=1);d>1&&--d;return d<1/6?f+(e-f)*6*d:d<.5?e:d<2/3?f+(e-f)*(2/3-d)*6:f};b=g(a+1/3);c=g(a);a=g(a-1/3)}g=function(d){d=Math.round(d*255).toString(16).toUpperCase();return d.length<2?"0"+d:d};return"#"+g(b)+g(c)+g(a)};
Blockly.Colours.categoryKey=function(a){if(!a)return null;var b={motion:"motion",looks:"looks",sounds:"sounds",sound:"sounds",pen:"pen",data:"data","data-lists":"data_lists",data_lists:"data_lists",events:"event",event:"event",control:"control",sensing:"sensing",interpolation:"interpolation",operators:"operators",more:"more"};return b.hasOwnProperty(a)?b[a]:null};Blockly.Blocks.math={};Blockly.Blocks.math_number={init:function(){this.jsonInit({message0:"%1",args0:[{type:"field_number",name:"NUM",value:"0"}],output:"Number",outputShape:Blockly.OUTPUT_SHAPE_ROUND,colour:Blockly.Colours.textField,colourSecondary:Blockly.Colours.textField,colourTertiary:Blockly.Colours.textField})}};
Blockly.Blocks.math_integer={init:function(){this.jsonInit({message0:"%1",args0:[{type:"field_number",name:"NUM",precision:1}],output:"Number",outputShape:Blockly.OUTPUT_SHAPE_ROUND,colour:Blockly.Colours.textField,colourSecondary:Blockly.Colours.textField,colourTertiary:Blockly.Colours.textField});var a=this.getField("NUM");a&&(a.setRestrictor(null),a.setValidator(function(b){return b}))}};
Blockly.Blocks.math_whole_number={init:function(){this.jsonInit({message0:"%1",args0:[{type:"field_number",name:"NUM",min:0,precision:1}],output:"Number",outputShape:Blockly.OUTPUT_SHAPE_ROUND,colour:Blockly.Colours.textField,colourSecondary:Blockly.Colours.textField,colourTertiary:Blockly.Colours.textField})}};
Blockly.Blocks.math_positive_number={init:function(){this.jsonInit({message0:"%1",args0:[{type:"field_number",name:"NUM",min:0}],output:"Number",outputShape:Blockly.OUTPUT_SHAPE_ROUND,colour:Blockly.Colours.textField,colourSecondary:Blockly.Colours.textField,colourTertiary:Blockly.Colours.textField})}};
Blockly.Blocks.math_angle={init:function(){this.jsonInit({message0:"%1",args0:[{type:"field_angle",name:"NUM",value:90}],output:"Number",outputShape:Blockly.OUTPUT_SHAPE_ROUND,colour:Blockly.Colours.textField,colourSecondary:Blockly.Colours.textField,colourTertiary:Blockly.Colours.textField})}};Blockly.Blocks.matrix={};Blockly.Blocks.matrix={init:function(){this.jsonInit({message0:"%1",args0:[{type:"field_matrix",name:"MATRIX"}],outputShape:Blockly.OUTPUT_SHAPE_ROUND,output:"Number",extensions:["colours_pen"]})}};Blockly.Blocks.xigua_matrix={};Blockly.Blocks.xigua_matrix={init:function(){this.jsonInit({message0:"%1",args0:[{type:"field_xigua_matrix",name:"XIGUA_MATRIX"}],outputShape:Blockly.OUTPUT_SHAPE_ROUND,output:"Number",extensions:["colours_pen"]})}};Blockly.Blocks.note={};Blockly.Blocks.note={init:function(){this.jsonInit({message0:"%1",args0:[{type:"field_note",name:"NOTE",value:60}],outputShape:Blockly.OUTPUT_SHAPE_ROUND,output:"Number",colour:Blockly.Colours.textField,colourSecondary:Blockly.Colours.textField,colourTertiary:Blockly.Colours.textField})}};Blockly.Blocks.xigua_white_board_note={};
Blockly.Blocks.xigua_white_board_note={init:function(){this.jsonInit({message0:"%1",args0:[{type:"field_xigua_white_board_note",name:"XIGUA_WHITE_BOARD_NOTE",value:60}],outputShape:Blockly.OUTPUT_SHAPE_ROUND,output:"Number",colour:Blockly.Colours.textField,colourSecondary:Blockly.Colours.textField,colourTertiary:Blockly.Colours.textField})}};Blockly.Blocks.texts={};Blockly.Blocks.text={init:function(){this.jsonInit({message0:"%1",args0:[{type:"field_input",name:"TEXT"}],output:"String",outputShape:Blockly.OUTPUT_SHAPE_ROUND,colour:Blockly.Colours.textField,colourSecondary:Blockly.Colours.textField,colourTertiary:Blockly.Colours.textField})}};
