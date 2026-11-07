/**
 * @license
 * Visual Blocks Language
 *
 * Copyright 2012 Google Inc.
 * https://developers.google.com/blockly/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview English strings.
 * @author ascii@media.mit.edu (Andrew Sliwinski)
 *
 * After modifying this file, run `npm run translate` from the root directory
 * to regenerate `./msg/json/en.json`.
 * IMPORTANT:
 * All message strings must use single quotes for the scripts to work properly
 */
'use strict';

goog.provide('Blockly.Msg.en');

goog.require('Blockly.Msg');

// Control blocks
Blockly.Msg.CONTROL_FOREVER = 'forever';
Blockly.Msg.CONTROL_REPEAT = 'repeat %1';
Blockly.Msg.CONTROL_IF = 'if %1 then';
Blockly.Msg.CONTROL_ELSE = 'else';
Blockly.Msg.CONTROL_STOP = 'stop';
Blockly.Msg.CONTROL_STOP_ALL = 'all';
Blockly.Msg.CONTROL_STOP_THIS = 'this script';
Blockly.Msg.CONTROL_STOP_OTHER = 'other scripts in sprite';
Blockly.Msg.CONTROL_WAIT = 'wait %1 seconds';
Blockly.Msg.CONTROL_WAITUNTIL = 'wait until %1';
Blockly.Msg.CONTROL_REPEATUNTIL = 'repeat until %1';
Blockly.Msg.CONTROL_WHILE = 'while %1';
Blockly.Msg.CONTROL_FOREACH = 'for each %1 in %2';
Blockly.Msg.CONTROL_STARTASCLONE = 'when I start as a clone';
Blockly.Msg.CONTROL_CREATECLONEOF = 'create clone of %1';
Blockly.Msg.CONTROL_CREATECLONEOF_MYSELF = 'myself';
Blockly.Msg.CONTROL_DELETETHISCLONE = 'delete this clone';
Blockly.Msg.CONTROL_COUNTER = 'counter';
Blockly.Msg.CONTROL_INCRCOUNTER = 'increment counter';
Blockly.Msg.CONTROL_CLEARCOUNTER = 'clear counter';
Blockly.Msg.CONTROL_ALLATONCE = 'all at once';

// Data blocks
Blockly.Msg.DATA_SETVARIABLETO = 'set %1 to %2';
Blockly.Msg.DATA_CHANGEVARIABLEBY = 'change %1 by %2';
Blockly.Msg.DATA_SHOWVARIABLE = 'show variable %1';
Blockly.Msg.DATA_HIDEVARIABLE = 'hide variable %1';
Blockly.Msg.DATA_ADDTOLIST = 'add %1 to %2';
Blockly.Msg.DATA_DELETEOFLIST = 'delete %1 of %2';
Blockly.Msg.DATA_DELETEALLOFLIST = 'delete all of %1';
Blockly.Msg.DATA_INSERTATLIST = 'insert %1 at %2 of %3';
Blockly.Msg.DATA_REPLACEITEMOFLIST = 'replace item %1 of %2 with %3';
Blockly.Msg.DATA_ITEMOFLIST = 'item %1 of %2';
Blockly.Msg.DATA_ITEMNUMOFLIST = 'item # of %1 in %2';
Blockly.Msg.DATA_LENGTHOFLIST = 'length of %1';
Blockly.Msg.DATA_LISTCONTAINSITEM = '%1 contains %2?';
Blockly.Msg.DATA_SHOWLIST = 'show list %1';
Blockly.Msg.DATA_HIDELIST = 'hide list %1';
Blockly.Msg.DATA_INDEX_ALL = 'all';
Blockly.Msg.DATA_INDEX_LAST = 'last';
Blockly.Msg.DATA_INDEX_RANDOM = 'random';

// Event blocks
Blockly.Msg.EVENT_WHENFLAGCLICKED = 'when %1 clicked';
Blockly.Msg.EVENT_WHENTHISSPRITECLICKED = 'when this sprite clicked';
Blockly.Msg.EVENT_WHENSTAGECLICKED = 'when stage clicked';
Blockly.Msg.EVENT_WHENTOUCHINGOBJECT = 'when this sprite touches %1';
Blockly.Msg.EVENT_WHENBROADCASTRECEIVED = 'when I receive %1';
Blockly.Msg.EVENT_WHENBACKDROPSWITCHESTO = 'when backdrop switches to %1';
Blockly.Msg.EVENT_WHENGREATERTHAN = 'when %1 > %2';
Blockly.Msg.EVENT_WHENGREATERTHAN_TIMER = 'timer';
Blockly.Msg.EVENT_WHENGREATERTHAN_LOUDNESS = 'loudness';
Blockly.Msg.EVENT_BROADCAST = 'broadcast %1';
Blockly.Msg.EVENT_BROADCASTANDWAIT = 'broadcast %1 and wait';
Blockly.Msg.EVENT_WHENKEYPRESSED = 'when %1 key pressed';
Blockly.Msg.EVENT_WHENKEYPRESSED_SPACE = 'space';
Blockly.Msg.EVENT_WHENKEYPRESSED_LEFT = 'left arrow';
Blockly.Msg.EVENT_WHENKEYPRESSED_RIGHT = 'right arrow';
Blockly.Msg.EVENT_WHENKEYPRESSED_DOWN = 'down arrow';
Blockly.Msg.EVENT_WHENKEYPRESSED_UP = 'up arrow';
Blockly.Msg.EVENT_WHENKEYPRESSED_ANY = 'any';

// Looks blocks
Blockly.Msg.LOOKS_SAYFORSECS = 'say %1 for %2 seconds';
Blockly.Msg.LOOKS_SAY = 'say %1';
Blockly.Msg.LOOKS_HELLO = 'Hello!';
Blockly.Msg.LOOKS_THINKFORSECS = 'think %1 for %2 seconds';
Blockly.Msg.LOOKS_THINK = 'think %1';
Blockly.Msg.LOOKS_HMM = 'Hmm...';
Blockly.Msg.LOOKS_SHOW = 'show';
Blockly.Msg.LOOKS_HIDE = 'hide';
Blockly.Msg.LOOKS_HIDEALLSPRITES = 'hide all sprites';
Blockly.Msg.LOOKS_EFFECT_COLOR = 'color';
Blockly.Msg.LOOKS_EFFECT_FISHEYE = 'fisheye';
Blockly.Msg.LOOKS_EFFECT_WHIRL = 'whirl';
Blockly.Msg.LOOKS_EFFECT_PIXELATE = 'pixelate';
Blockly.Msg.LOOKS_EFFECT_MOSAIC = 'mosaic';
Blockly.Msg.LOOKS_EFFECT_BRIGHTNESS = 'brightness';
Blockly.Msg.LOOKS_EFFECT_GHOST = 'ghost';
Blockly.Msg.LOOKS_CHANGEEFFECTBY = 'change %1 effect by %2';
Blockly.Msg.LOOKS_SETEFFECTTO = 'set %1 effect to %2';
Blockly.Msg.LOOKS_CLEARGRAPHICEFFECTS = 'clear graphic effects';
Blockly.Msg.LOOKS_CHANGESIZEBY = 'change size by %1';
Blockly.Msg.LOOKS_SETSIZETO = 'set size to %1 %';
Blockly.Msg.LOOKS_SIZE = 'size';
Blockly.Msg.LOOKS_CHANGESTRETCHBY = 'change stretch by %1';
Blockly.Msg.LOOKS_SETSTRETCHTO = 'set stretch to %1 %';
Blockly.Msg.LOOKS_SWITCHCOSTUMETO = 'switch costume to %1';
Blockly.Msg.LOOKS_NEXTCOSTUME = 'next costume';
Blockly.Msg.LOOKS_SWITCHBACKDROPTO = 'switch backdrop to %1';
Blockly.Msg.LOOKS_GOTOFRONTBACK = 'go to %1 layer';
Blockly.Msg.LOOKS_GOTOFRONTBACK_FRONT = 'front';
Blockly.Msg.LOOKS_GOTOFRONTBACK_BACK = 'back';
Blockly.Msg.LOOKS_GOFORWARDBACKWARDLAYERS = 'go %1 %2 layers';
Blockly.Msg.LOOKS_GOFORWARDBACKWARDLAYERS_FORWARD = 'forward';
Blockly.Msg.LOOKS_GOFORWARDBACKWARDLAYERS_BACKWARD = 'backward';
Blockly.Msg.LOOKS_BACKDROPNUMBERNAME = 'backdrop %1';
Blockly.Msg.LOOKS_COSTUMENUMBERNAME = 'costume %1';
Blockly.Msg.LOOKS_NUMBERNAME_NUMBER = 'number';
Blockly.Msg.LOOKS_NUMBERNAME_NAME = 'name';
Blockly.Msg.LOOKS_SWITCHBACKDROPTOANDWAIT = 'switch backdrop to %1 and wait';
Blockly.Msg.LOOKS_NEXTBACKDROP_BLOCK = 'next backdrop';
Blockly.Msg.LOOKS_NEXTBACKDROP = 'next backdrop';
Blockly.Msg.LOOKS_PREVIOUSBACKDROP = 'previous backdrop';
Blockly.Msg.LOOKS_RANDOMBACKDROP = 'random backdrop';

// Motion blocks
Blockly.Msg.MOTION_MOVESTEPS = 'move %1 steps';
Blockly.Msg.MOTION_TURNLEFT = 'turn %1 %2 degrees';
Blockly.Msg.MOTION_TURNRIGHT = 'turn %1 %2 degrees';
Blockly.Msg.MOTION_POINTINDIRECTION = 'point in direction %1';
Blockly.Msg.MOTION_POINTTOWARDS = 'point towards %1';
Blockly.Msg.MOTION_POINTTOWARDS_POINTER = 'mouse-pointer';
Blockly.Msg.MOTION_POINTTOWARDS_RANDOM = 'random direction';
Blockly.Msg.MOTION_GOTO = 'go to %1';
Blockly.Msg.MOTION_GOTO_POINTER = 'mouse-pointer';
Blockly.Msg.MOTION_GOTO_RANDOM = 'random position';
Blockly.Msg.MOTION_GOTOXY = 'go to x: %1 y: %2';
Blockly.Msg.MOTION_GLIDESECSTOXY = 'glide %1 secs to x: %2 y: %3';
Blockly.Msg.MOTION_GLIDETO = 'glide %1 secs to %2';
Blockly.Msg.MOTION_GLIDETO_POINTER = 'mouse-pointer';
Blockly.Msg.MOTION_GLIDETO_RANDOM = 'random position';
Blockly.Msg.MOTION_CHANGEXBY = 'change x by %1';
Blockly.Msg.MOTION_SETX = 'set x to %1';
Blockly.Msg.MOTION_CHANGEYBY = 'change y by %1';
Blockly.Msg.MOTION_SETY = 'set y to %1';
Blockly.Msg.MOTION_IFONEDGEBOUNCE = 'if on edge, bounce';
Blockly.Msg.MOTION_SETROTATIONSTYLE = 'set rotation style %1';
Blockly.Msg.MOTION_SETROTATIONSTYLE_LEFTRIGHT = 'left-right';
Blockly.Msg.MOTION_SETROTATIONSTYLE_DONTROTATE = 'don\'t rotate';
Blockly.Msg.MOTION_SETROTATIONSTYLE_ALLAROUND = 'all around';
Blockly.Msg.MOTION_XPOSITION = 'x position';
Blockly.Msg.MOTION_YPOSITION = 'y position';
Blockly.Msg.MOTION_DIRECTION = 'direction';
Blockly.Msg.MOTION_SCROLLRIGHT = 'scroll right %1';
Blockly.Msg.MOTION_SCROLLUP = 'scroll up %1';
Blockly.Msg.MOTION_ALIGNSCENE = 'align scene %1';
Blockly.Msg.MOTION_ALIGNSCENE_BOTTOMLEFT = 'bottom-left';
Blockly.Msg.MOTION_ALIGNSCENE_BOTTOMRIGHT = 'bottom-right';
Blockly.Msg.MOTION_ALIGNSCENE_MIDDLE = 'middle';
Blockly.Msg.MOTION_ALIGNSCENE_TOPLEFT = 'top-left';
Blockly.Msg.MOTION_ALIGNSCENE_TOPRIGHT = 'top-right';
Blockly.Msg.MOTION_XSCROLL = 'x scroll';
Blockly.Msg.MOTION_YSCROLL = 'y scroll';
Blockly.Msg.MOTION_STAGE_SELECTED = 'Stage selected: no motion blocks';

// Operators blocks
Blockly.Msg.OPERATORS_ADD = '%1 + %2';
Blockly.Msg.OPERATORS_SUBTRACT = '%1 - %2';
Blockly.Msg.OPERATORS_MULTIPLY = '%1 * %2';
Blockly.Msg.OPERATORS_DIVIDE = '%1 / %2';
Blockly.Msg.OPERATORS_RANDOM = 'pick random %1 to %2';
Blockly.Msg.OPERATORS_GT = '%1 > %2';
Blockly.Msg.OPERATORS_LT = '%1 < %2';
Blockly.Msg.OPERATORS_EQUALS = '%1 = %2';
Blockly.Msg.OPERATORS_AND = '%1 and %2';
Blockly.Msg.OPERATORS_OR = '%1 or %2';
Blockly.Msg.OPERATORS_NOT = 'not %1';
Blockly.Msg.OPERATORS_JOIN = 'join %1 %2';
Blockly.Msg.OPERATORS_JOIN_APPLE = 'apple';
Blockly.Msg.OPERATORS_JOIN_BANANA = 'banana';
Blockly.Msg.OPERATORS_LETTEROF = 'letter %1 of %2';
Blockly.Msg.OPERATORS_LETTEROF_APPLE = 'a';
Blockly.Msg.OPERATORS_LENGTH = 'length of %1';
Blockly.Msg.OPERATORS_CONTAINS = '%1 contains %2?';
Blockly.Msg.OPERATORS_MOD = '%1 mod %2';
Blockly.Msg.OPERATORS_ROUND = 'round %1';
Blockly.Msg.OPERATORS_MATHOP = '%1 of %2';
Blockly.Msg.OPERATORS_MATHOP_ABS = 'abs';
Blockly.Msg.OPERATORS_MATHOP_FLOOR = 'floor';
Blockly.Msg.OPERATORS_MATHOP_CEILING = 'ceiling';
Blockly.Msg.OPERATORS_MATHOP_SQRT = 'sqrt';
Blockly.Msg.OPERATORS_MATHOP_SIN = 'sin';
Blockly.Msg.OPERATORS_MATHOP_COS = 'cos';
Blockly.Msg.OPERATORS_MATHOP_TAN = 'tan';
Blockly.Msg.OPERATORS_MATHOP_ASIN = 'asin';
Blockly.Msg.OPERATORS_MATHOP_ACOS = 'acos';
Blockly.Msg.OPERATORS_MATHOP_ATAN = 'atan';
Blockly.Msg.OPERATORS_MATHOP_LN = 'ln';
Blockly.Msg.OPERATORS_MATHOP_LOG = 'log';
Blockly.Msg.OPERATORS_MATHOP_EEXP = 'e ^';
Blockly.Msg.OPERATORS_MATHOP_10EXP = '10 ^';

// Procedures blocks
Blockly.Msg.PROCEDURES_DEFINITION = 'define %1';
Blockly.Msg.PROCEDURES_RUN_BRANCH = 'run %1';
Blockly.Msg.PROCEDURES_BRANCH_DEFAULT_NAME = 'body';
Blockly.Msg.PROCEDURES_STRING_DEFAULT_NAME = 'number or text';
Blockly.Msg.PROCEDURES_BOOLEAN_DEFAULT_NAME = 'boolean';
/// 在自制积木上加一段固定文字时，那一格默认写什么
Blockly.Msg.PROCEDURES_LABEL_DEFAULT_NAME = 'label text';
Blockly.Msg.PROCEDURES_BRANCH_NAME_N = 'body %1';
/// 给积木堆加一个参数（调用的人能把它拖进身体里用）时，那一格默认叫什么
Blockly.Msg.PROCEDURES_BRANCH_ARGUMENT_DEFAULT_NAME = 'item';

// Sensing blocks
Blockly.Msg.SENSING_TOUCHINGOBJECT = 'touching %1?';
Blockly.Msg.SENSING_TOUCHINGOBJECT_POINTER = 'mouse-pointer';
Blockly.Msg.SENSING_TOUCHINGOBJECT_EDGE = 'edge';
Blockly.Msg.SENSING_TOUCHINGCOLOR = 'touching color %1?';
Blockly.Msg.SENSING_COLORISTOUCHINGCOLOR = 'color %1 is touching %2?';
Blockly.Msg.SENSING_DISTANCETO = 'distance to %1';
Blockly.Msg.SENSING_DISTANCETO_POINTER = 'mouse-pointer';
Blockly.Msg.SENSING_ASKANDWAIT = 'ask %1 and wait';
Blockly.Msg.SENSING_ASK_TEXT = 'What\'s your name?';
Blockly.Msg.SENSING_ANSWER = 'answer';
Blockly.Msg.SENSING_KEYPRESSED = 'key %1 pressed?';
Blockly.Msg.SENSING_MOUSEDOWN = 'mouse down?';
Blockly.Msg.SENSING_MOUSEX = 'mouse x';
Blockly.Msg.SENSING_MOUSEY = 'mouse y';
Blockly.Msg.SENSING_SETDRAGMODE = 'set drag mode %1';
Blockly.Msg.SENSING_SETDRAGMODE_DRAGGABLE = 'draggable';
Blockly.Msg.SENSING_SETDRAGMODE_NOTDRAGGABLE = 'not draggable';

Blockly.Msg.INTERPOLATION_SETMODE = 'set my interpolation to %1';
Blockly.Msg.INTERPOLATION_MODE_AUTO = 'auto';
Blockly.Msg.INTERPOLATION_MODE_ON = 'on';
Blockly.Msg.INTERPOLATION_MODE_OFF = 'off';
Blockly.Msg.INTERPOLATION_SNAP = 'do not interpolate my %1 this frame';
Blockly.Msg.INTERPOLATION_SNAP_ALL = 'everything';
Blockly.Msg.INTERPOLATION_SNAP_POSITION = 'position';
Blockly.Msg.INTERPOLATION_SNAP_DIRECTION = 'direction';
Blockly.Msg.INTERPOLATION_SNAP_SIZE = 'size';
Blockly.Msg.INTERPOLATION_SNAP_EFFECTS = 'effects';
Blockly.Msg.INTERPOLATION_GOTOXY = 'snap to x: %1 y: %2';
Blockly.Msg.INTERPOLATION_POINTINDIRECTION = 'snap to direction %1';
Blockly.Msg.INTERPOLATION_SETSIZE = 'snap size to %1 %';
Blockly.Msg.INTERPOLATION_SETEFFECT = 'snap %1 effect to %2';
Blockly.Msg.INTERPOLATION_SETTOLERANCE = 'set my interpolation tolerance to %1';
Blockly.Msg.INTERPOLATION_LABEL_INSTANT = 'without interpolating';
Blockly.Msg.INTERPOLATION_LABEL_SPRITE = 'this sprite';
Blockly.Msg.INTERPOLATION_ENABLED = 'interpolation on?';
Blockly.Msg.CATEGORY_INTERPOLATION = 'Interpolation';
Blockly.Msg.SENSING_LOUDNESS = 'loudness';
Blockly.Msg.SENSING_LOUD = 'loud?';
Blockly.Msg.SENSING_TIMER = 'timer';
Blockly.Msg.SENSING_RESETTIMER = 'reset timer';
Blockly.Msg.SENSING_DELTATIME = 'delta time';
Blockly.Msg.SENSING_PERSECOND = '%1 per second';
Blockly.Msg.SENSING_FRAMERATE = 'frame rate';
Blockly.Msg.SENSING_OF = '%1 of %2';
Blockly.Msg.SENSING_OF_XPOSITION = 'x position';
Blockly.Msg.SENSING_OF_YPOSITION = 'y position';
Blockly.Msg.SENSING_OF_DIRECTION = 'direction';
Blockly.Msg.SENSING_OF_COSTUMENUMBER = 'costume #';
Blockly.Msg.SENSING_OF_COSTUMENAME = 'costume name';
Blockly.Msg.SENSING_OF_SIZE = 'size';
Blockly.Msg.SENSING_OF_VOLUME = 'volume';
Blockly.Msg.SENSING_OF_BACKDROPNUMBER = 'backdrop #';
Blockly.Msg.SENSING_OF_BACKDROPNAME = 'backdrop name';
Blockly.Msg.SENSING_OF_STAGE = 'Stage';
Blockly.Msg.SENSING_CURRENT = 'current %1';
Blockly.Msg.SENSING_CURRENT_YEAR = 'year';
Blockly.Msg.SENSING_CURRENT_MONTH = 'month';
Blockly.Msg.SENSING_CURRENT_DATE = 'date';
Blockly.Msg.SENSING_CURRENT_DAYOFWEEK = 'day of week';
Blockly.Msg.SENSING_CURRENT_HOUR = 'hour';
Blockly.Msg.SENSING_CURRENT_MINUTE = 'minute';
Blockly.Msg.SENSING_CURRENT_SECOND = 'second';
Blockly.Msg.SENSING_DAYSSINCE2000 = 'days since 2000';
Blockly.Msg.SENSING_USERNAME = 'username';
Blockly.Msg.SENSING_USERID = 'user id';

// Sound blocks
Blockly.Msg.SOUND_PLAY = 'start sound %1';
Blockly.Msg.SOUND_PLAYUNTILDONE = 'play sound %1 until done';
Blockly.Msg.SOUND_STOPALLSOUNDS = 'stop all sounds';
Blockly.Msg.SOUND_SETEFFECTO = 'set %1 effect to %2';
Blockly.Msg.SOUND_CHANGEEFFECTBY = 'change %1 effect by %2';
Blockly.Msg.SOUND_CLEAREFFECTS = 'clear sound effects';
Blockly.Msg.SOUND_EFFECTS_PITCH = 'pitch';
Blockly.Msg.SOUND_EFFECTS_PAN = 'pan left/right';
Blockly.Msg.SOUND_CHANGEVOLUMEBY = 'change volume by %1';
Blockly.Msg.SOUND_SETVOLUMETO = 'set volume to %1%';
Blockly.Msg.SOUND_VOLUME = 'volume';
Blockly.Msg.SOUND_RECORD = 'record...';

// Category labels
Blockly.Msg.CATEGORY_MOTION = 'Motion';
Blockly.Msg.CATEGORY_LOOKS = 'Looks';
Blockly.Msg.CATEGORY_SOUND = 'Sound';
Blockly.Msg.CATEGORY_EVENTS = 'Events';
Blockly.Msg.CATEGORY_CONTROL = 'Control';
Blockly.Msg.CATEGORY_SENSING = 'Sensing';
Blockly.Msg.CATEGORY_OPERATORS = 'Operators';
Blockly.Msg.CATEGORY_VARIABLES = 'Variables';
Blockly.Msg.CATEGORY_LISTS = 'Lists';
Blockly.Msg.CATEGORY_MYBLOCKS = 'My Blocks';

// Context menus
Blockly.Msg.DUPLICATE = 'Duplicate';
Blockly.Msg.DELETE = 'Delete';
Blockly.Msg.ADD_COMMENT = 'Add Comment';
Blockly.Msg.REMOVE_COMMENT = 'Remove Comment';
Blockly.Msg.DELETE_BLOCK = 'Delete Block';
Blockly.Msg.DELETE_X_BLOCKS = 'Delete %1 Blocks';
Blockly.Msg.DELETE_ALL_BLOCKS = 'Delete all %1 blocks?';
Blockly.Msg.CLEAN_UP = 'Clean up Blocks';
Blockly.Msg.HELP = 'Help';
Blockly.Msg.UNDO = 'Undo';
Blockly.Msg.REDO = 'Redo';
Blockly.Msg.CREATE_FRAME = 'Create Frame';
Blockly.Msg.DUPLICATE_FRAME = 'Duplicate';
Blockly.Msg.CLEAN_UP_FRAME = 'Clean up Blocks';
Blockly.Msg.EDIT_PROCEDURE = 'Edit';
Blockly.Msg.SHOW_PROCEDURE_DEFINITION = 'Go to definition';
Blockly.Msg.WORKSPACE_COMMENT_DEFAULT_TEXT = 'Say something...';

// Color
Blockly.Msg.COLOUR_HUE_LABEL = 'Color';
Blockly.Msg.COLOUR_SATURATION_LABEL = 'Saturation';
Blockly.Msg.COLOUR_BRIGHTNESS_LABEL = 'Brightness';
/// 积木拾色面板里那颗吸管按钮的悬停提示。
Blockly.Msg.COLOUR_EYEDROPPER_TOOLTIP = 'Pick a color from the stage';
/// 积木拾色面板里「最近用过」那一排色板的小标题。
Blockly.Msg.COLOUR_RECENT_LABEL = 'Recent';

// Variables
// @todo Remove these once fully managed by Scratch VM / Scratch GUI
Blockly.Msg.CHANGE_VALUE_TITLE = 'Change value:';
Blockly.Msg.RENAME_VARIABLE = 'Rename variable';
Blockly.Msg.RENAME_VARIABLE_TITLE = 'Rename all "%1" variables to:';
Blockly.Msg.RENAME_VARIABLE_MODAL_TITLE = 'Rename Variable';
Blockly.Msg.NEW_VARIABLE = 'Make a Variable';
Blockly.Msg.NEW_VARIABLE_TITLE = 'New variable name:';
Blockly.Msg.VARIABLE_MODAL_TITLE = 'New Variable';
Blockly.Msg.VARIABLE_ALREADY_EXISTS = 'A variable named "%1" already exists.';
Blockly.Msg.VARIABLE_ALREADY_EXISTS_FOR_ANOTHER_TYPE = 'A variable named "%1" already exists for another variable of type "%2".';
Blockly.Msg.DELETE_VARIABLE_CONFIRMATION = 'Delete %1 uses of the "%2" variable?';
Blockly.Msg.CANNOT_DELETE_VARIABLE_PROCEDURE = 'Can\'t delete the variable "%1" because it\'s part of the definition of the function "%2"';
Blockly.Msg.DELETE_VARIABLE = 'Delete the "%1" variable';
Blockly.Msg.VARIABLE = 'variable';
Blockly.Msg.LIST = 'list';

// Custom Procedures
// @todo Remove these once fully managed by Scratch VM / Scratch GUI
Blockly.Msg.NEW_PROCEDURE = 'Make a Block';
Blockly.Msg.PROCEDURE_ALREADY_EXISTS = 'A procedure named "%1" already exists.';
Blockly.Msg.PROCEDURE_DEFAULT_NAME = 'block name';
Blockly.Msg.PROCEDURE_USED = 'To delete a block definition, first remove all uses of the block';
Blockly.Msg.Global_PROCEDURE_USED = 'To delete a global block definition, first remove all uses of the block in sprite %1';


// Lists
// @todo Remove these once fully managed by Scratch VM / Scratch GUI
Blockly.Msg.NEW_LIST = 'Make a List';
Blockly.Msg.NEW_LIST_TITLE = 'New list name:';
Blockly.Msg.LIST_MODAL_TITLE = 'New List';
Blockly.Msg.LIST_ALREADY_EXISTS = 'A list named "%1" already exists.';
Blockly.Msg.RENAME_LIST_TITLE = 'Rename all "%1" lists to:';
Blockly.Msg.RENAME_LIST_MODAL_TITLE = 'Rename List';
Blockly.Msg.DEFAULT_LIST_ITEM = 'thing';
Blockly.Msg.DELETE_LIST = 'Delete the "%1" list';
Blockly.Msg.RENAME_LIST = 'Rename list';

// Broadcast Messages
// @todo Remove these once fully managed by Scratch VM / Scratch GUI
Blockly.Msg.NEW_BROADCAST_MESSAGE = 'New message';
Blockly.Msg.NEW_BROADCAST_MESSAGE_TITLE = 'New message name:';
/// dropdown choice - Rename the currently selected broadcast message.
/// confirm - Offer to delete a procedure definition together with everything that calls it. %1 is how many calls there are.
/// dropdown choice - The Enter key.
Blockly.Msg.EVENT_WHENKEYPRESSED_ENTER = 'enter';
/// dropdown choice - The Backspace key.
Blockly.Msg.EVENT_WHENKEYPRESSED_BACKSPACE = 'backspace';
/// dropdown choice - The Delete key.
Blockly.Msg.EVENT_WHENKEYPRESSED_DELETE = 'delete';
/// dropdown choice - The Shift key.
Blockly.Msg.EVENT_WHENKEYPRESSED_SHIFT = 'shift';
/// dropdown choice - The Caps Lock key.
Blockly.Msg.EVENT_WHENKEYPRESSED_CAPS_LOCK = 'caps lock';
/// dropdown choice - The Scroll Lock key.
Blockly.Msg.EVENT_WHENKEYPRESSED_SCROLL_LOCK = 'scroll lock';
/// dropdown choice - The Control key.
Blockly.Msg.EVENT_WHENKEYPRESSED_CONTROL = 'control';
/// dropdown choice - The Escape key.
Blockly.Msg.EVENT_WHENKEYPRESSED_ESCAPE = 'escape';
/// dropdown choice - The Insert key.
Blockly.Msg.EVENT_WHENKEYPRESSED_INSERT = 'insert';
/// dropdown choice - The Home key.
Blockly.Msg.EVENT_WHENKEYPRESSED_HOME = 'home';
/// dropdown choice - The End key.
Blockly.Msg.EVENT_WHENKEYPRESSED_END = 'end';
/// dropdown choice - The Page Up key.
Blockly.Msg.EVENT_WHENKEYPRESSED_PAGE_UP = 'page up';
/// dropdown choice - The Page Down key.
Blockly.Msg.EVENT_WHENKEYPRESSED_PAGE_DOWN = 'page down';
Blockly.Msg.PROCEDURE_USED_DELETE_ALL = 'This block is used in %1 place(s). Delete the definition and all of them?';
/// dropdown choice - Rename the currently selected broadcast message.
Blockly.Msg.RENAME_BROADCAST_MESSAGE = 'Rename message';
/// prompt - Rename a broadcast message. %1 is the old name.
Blockly.Msg.RENAME_BROADCAST_MESSAGE_TITLE = 'Rename all "%1" messages to:';
/// modal title - Rename a broadcast message.
Blockly.Msg.RENAME_BROADCAST_MESSAGE_MODAL_TITLE = 'Rename Message';
Blockly.Msg.BROADCAST_MODAL_TITLE = 'New Message';
Blockly.Msg.DEFAULT_BROADCAST_MESSAGE_NAME = 'message1';

Blockly.Msg.COLLAPSED_X_BLOCKS = "Collapsed %1 blocks";
Blockly.Msg.FRAME_COLLAPSED_SUMMARY = "%1 blocks in %2 scripts";
Blockly.Msg.FRAME_FIT_TO_CONTENTS = "Fit to Contents";

// Gandi core block additions (gandi-gui-3.0/docs/core-blocks-design.md).
// Chinese and other languages are filled in by the editor, see src/blocks/loadBlockly.ts.
Blockly.Msg.MOTION_ROTATIONSTYLE = 'rotation style';
Blockly.Msg.MOTION_ISROTATIONSTYLE = 'rotation style is %1?';
Blockly.Msg.MOTION_SETROTATIONCENTEROFFSET = 'set rotation center offset to x: %1 y: %2';
Blockly.Msg.MOTION_ROTATIONCENTEROFFSET = 'rotation center offset %1';
Blockly.Msg.LOOKS_EFFECT_SATURATION = 'saturation';
Blockly.Msg.LOOKS_EFFECT_LIGHTNESS = 'lightness';
Blockly.Msg.LOOKS_VISIBLE = 'shown?';
Blockly.Msg.LOOKS_LAYER = 'layer';
Blockly.Msg.LOOKS_GOTOLAYER = 'go to layer %1';
Blockly.Msg.LOOKS_EFFECTVALUE = '%1 effect';
Blockly.Msg.LOOKS_SETSTRETCH = 'set stretch to x: %1 y: %2 %';
Blockly.Msg.LOOKS_CHANGESTRETCH = 'change stretch by x: %1 y: %2';
Blockly.Msg.LOOKS_STRETCH = 'stretch %1';
Blockly.Msg.LOOKS_CHANGESTRETCHX = 'change x stretch by %1';
Blockly.Msg.LOOKS_SETSTRETCHX = 'set x stretch to %1 %';
Blockly.Msg.LOOKS_CHANGESTRETCHY = 'change y stretch by %1';
Blockly.Msg.LOOKS_SETSTRETCHY = 'set y stretch to %1 %';
Blockly.Msg.LOOKS_COSTUMEINFO = 'costume %1 %2';
Blockly.Msg.LOOKS_COSTUMEINFO_CURRENT = 'current costume';
Blockly.Msg.LOOKS_COSTUMEINFO_WIDTH = 'width';
Blockly.Msg.LOOKS_COSTUMEINFO_HEIGHT = 'height';
Blockly.Msg.LOOKS_COSTUMEINFO_NAME = 'name';
Blockly.Msg.LOOKS_COSTUMEINFO_NUMBER = 'number';
Blockly.Msg.LOOKS_COSTUMEINFO_CENTERX = 'center x';
Blockly.Msg.LOOKS_COSTUMEINFO_CENTERY = 'center y';
Blockly.Msg.LOOKS_COSTUMECOUNT = 'number of %1';
Blockly.Msg.LOOKS_COSTUMECOUNT_COSTUME = 'costumes';
Blockly.Msg.LOOKS_COSTUMECOUNT_BACKDROP = 'backdrops';
Blockly.Msg.LOOKS_SETBUBBLESTYLE = 'set speech bubble style to %1';
Blockly.Msg.LOOKS_BUBBLESTYLE_DEFAULT = 'default';
Blockly.Msg.LOOKS_BUBBLESTYLE_ROUNDED = 'rounded';
Blockly.Msg.LOOKS_BUBBLESTYLE_SQUARE = 'square';
Blockly.Msg.LOOKS_BUBBLESTYLE_BORDERLESS = 'borderless';
Blockly.Msg.LOOKS_BUBBLESTYLE_DARK = 'dark';
Blockly.Msg.LOOKS_VIDEOPLAY = 'play video from start';
Blockly.Msg.LOOKS_VIDEOPAUSE = 'pause video';
Blockly.Msg.LOOKS_VIDEORESUME = 'resume video';
Blockly.Msg.LOOKS_VIDEOSEEK = 'seek video to %1 seconds';
Blockly.Msg.LOOKS_VIDEOSPEED = 'set video speed to %1 %';
Blockly.Msg.LOOKS_VIDEOLOOP = 'set video loop to %1';
Blockly.Msg.LOOKS_VIDEOLOOP_ON = 'on';
Blockly.Msg.LOOKS_VIDEOLOOP_OFF = 'off';
Blockly.Msg.LOOKS_VIDEOTIME = 'video time';
Blockly.Msg.LOOKS_VIDEODURATION = 'video duration';
Blockly.Msg.LOOKS_VIDEOPLAYING = 'video playing?';
Blockly.Msg.LOOKS_WHENVIDEOENDED = 'when video ends';
Blockly.Msg.LOOKS_PLAYVIDEO = 'play video %1';
Blockly.Msg.LOOKS_PLAYVIDEOUNTILDONE = 'play video %1 until done';
Blockly.Msg.LOOKS_LOOPVIDEO = 'loop video %1';
Blockly.Msg.LOOKS_VIDEOCONTROL = '%1 video %2';
Blockly.Msg.LOOKS_VIDEOCONTROL_PAUSE = 'pause';
Blockly.Msg.LOOKS_VIDEOCONTROL_RESUME = 'resume';
Blockly.Msg.LOOKS_VIDEOCONTROL_STOP = 'stop';
Blockly.Msg.LOOKS_SEEKVIDEO = 'seek video %1 to %2 seconds';
Blockly.Msg.LOOKS_SETVIDEO = 'set video %1 %2 to %3 %';
Blockly.Msg.LOOKS_WHENVIDEOENDS = 'when video %1 ends';
Blockly.Msg.LOOKS_VIDEO_ANY = 'any';
Blockly.Msg.LOOKS_VIDEOINFO = 'video %1 %2';
Blockly.Msg.LOOKS_VIDEOISPLAYING = 'video %1 playing?';
Blockly.Msg.LOOKS_VIDEO_TIME = 'time';
Blockly.Msg.LOOKS_VIDEO_DURATION = 'duration';
Blockly.Msg.LOOKS_VIDEO_SPEED = 'speed';
Blockly.Msg.LOOKS_VIDEO_VOLUME = 'volume';
Blockly.Msg.LOOKS_SETBUBBLECOLOR = 'set speech bubble %1 color to %2';
Blockly.Msg.LOOKS_BUBBLECOLOR_FILL = 'fill';
Blockly.Msg.LOOKS_BUBBLECOLOR_TEXT = 'text';
Blockly.Msg.LOOKS_BUBBLECOLOR_STROKE = 'border';
Blockly.Msg.SOUND_ALLSOUNDS = 'all sounds';
Blockly.Msg.SOUND_CONTROL = 'make %2 %1';
Blockly.Msg.SOUND_CONTROL_STOP = 'stop';
Blockly.Msg.SOUND_CONTROL_PAUSE = 'pause';
Blockly.Msg.SOUND_CONTROL_RESUME = 'resume';
Blockly.Msg.SOUND_PLAYFROM = 'start sound %1 at %2 seconds';
Blockly.Msg.SOUND_EFFECTVALUE = '%1 effect';
Blockly.Msg.SOUND_DURATION = 'length of %1';
Blockly.Msg.SOUND_ISPLAYING = '%1 playing?';
Blockly.Msg.CONTROL_ISCLONE = 'clone?';
Blockly.Msg.CONTROL_BREAK = 'break loop';
Blockly.Msg.CONTROL_CONTINUE = 'skip to next loop';
Blockly.Msg.CONTROL_WARP = 'run instantly';
Blockly.Msg.SENSING_MOUSEBUTTON = '%1 mouse button down?';
Blockly.Msg.SENSING_MOUSEBUTTON_LEFT = 'left';
Blockly.Msg.SENSING_MOUSEBUTTON_RIGHT = 'right';
Blockly.Msg.SENSING_MOUSEBUTTON_MIDDLE = 'middle';
Blockly.Msg.SENSING_MOUSEBUTTON_ANY = 'any';
Blockly.Msg.SENSING_OF_VISIBLE = 'shown?';
Blockly.Msg.SENSING_OF_LAYER = 'layer';
Blockly.Msg.SENSING_OF_ROTATIONSTYLE = 'rotation style';
Blockly.Msg.SENSING_OF_STRETCHX = 'stretch x';
Blockly.Msg.SENSING_OF_STRETCHY = 'stretch y';
Blockly.Msg.OPERATORS_POWER = '%1 ^ %2';
Blockly.Msg.OPERATORS_STRICTEQUALS = '%1 ≡ %2';
Blockly.Msg.OPERATORS_ROUNDTO = 'round %1 to %2 decimal places';
Blockly.Msg.OPERATORS_TERNARY = 'if %1 then %2 else %3';
