import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js";
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/apiResponse.js";

const registerUser = asyncHandler(async (req, res) => {
  const { fullname, username, email, password } = req.body;

  //validation

  if (
    [fullname, username, email, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existedUser = await User.findOne({ $or: [{ username }, { email }] });

  if (existedUser) {
    throw new ApiError(409, "User Already exist");
  }

  const localAvatarPath = req.files?.avatar[0]?.path;
  const coverLocalPath = req.files?.coverImage[0]?.path;

  let avatar = "";

  try {
    avatar = await uploadOnCloudinary(localAvatarPath);
    console.log(" uploaded avatar", avatar);
  } catch (error) {
    console.log("error uploading avatar", error);
    throw new Error(500, "failed to upload avatar");
  }

  let coverImage = "";
  try {
    coverImage = await uploadOnCloudinary(coverLocalPath);
    console.log(" uploaded cover Image", coverImage);
  } catch (error) {
    console.log("error uploading cover image", error);
    throw new Error(500, "failed to upload cover Image");
  }
  try {
    const user = User.create({
      fullname,
      username: username.toLowerCase(),
      email,
      password,
      avatar: avatar.url,
      coverImage: coverImage?.url || "",
    });

    const createdUser = await User.findById(user._id).select(
      "-password -refreshToken "
    );

    if (!user) {
      throw new ApiError(500, "Something went wrong while registering");
    }

    return res
      .status(201)
      .json(new ApiResponse(200, createdUser, "User Registered"));
  } catch (error) {
    console.log("user creation failed");

    if (avatar) {
      await deleteFromCloudinary(avatar.public_Id);
    }
    if (coverImage) {
      await deleteFromCloudinary(coverImage.public_Id);
    }
    throw new ApiError(
      500,
      "Something went wrong while registering and images are deleted"
    );
  }
});

export { registerUser };
