import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js";
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/apiResponse.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefresh = async (userID) => {
  try {
    const user = await User.findById(userID);

    const accessToken = user.generateAccessAndRefresh();
    const refreshToken = user.generateAccessAndRefresh();

    user.refreshToken = refreshToken;

    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "something went wrong while generating and refreshing the acess tokens"
    );
  }
};

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

const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;

  //validation
  if (!email) {
    throw new ApiError(400, "email is required");
  }

  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // validate password

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "invalid credentials");
  }
  const { accessToken, refreshToken } = await generateAccessAndRefresh(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password, -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };

  return res
    .status(200)
    .cookie("-accessToken", accessToken, options)
    .cookie("-refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "user logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    }
  );
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };
  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefeshToken = req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefeshToken) {
    throw new ApiError(401, "refresh token is required");
  }

  try {
    const decodeToken = jwt.verify(
      incomingRefeshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    const user = await User.findById(decodeToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }
    if (incomingRefeshToken !== user?.refreshToken) {
      throw new ApiError(401, "Invalid refresh token");
    }
    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    };

    const { accessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefresh(user._id);

    return res
      .status(200)
      .cookie("-accessToken", accessToken, options)
      .cookie("-refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { user: newRefreshToken },
          "Access refreshed token successfully"
        )
      );
  } catch (error) {
    throw new Error(500, "something went wrong while refreshing acess token");
  }
});

export { registerUser, loginUser, refreshAccessToken, logoutUser };
